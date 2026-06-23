import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const spaceSummary = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor", "viewer"] as unknown as SpaceMembers["role"][],
                });

                const balanceRow = await trx
                    .selectFrom("account_balances")
                    .innerJoin(
                        "space_accounts",
                        "space_accounts.account_id",
                        "account_balances.account_id"
                    )
                    .innerJoin("accounts", "accounts.id", "space_accounts.account_id")
                    .where("space_accounts.space_id", "=", input.spaceId)
                    .select((eb) => [
                        eb.fn
                            .sum<string>(
                                eb
                                    .case()
                                    .when("accounts.account_type", "=", "liability" as any)
                                    .then(eb.neg("account_balances.balance"))
                                    .else(eb.ref("account_balances.balance"))
                                    .end()
                            )
                            .as("total_balance"),
                        eb.fn
                            .sum<string>(
                                eb
                                    .case()
                                    .when("accounts.account_type", "=", "liability" as any)
                                    .then(eb.neg("account_balances.balance"))
                                    .when("accounts.account_type", "=", "locked" as any)
                                    .then(0)
                                    .else(eb.ref("account_balances.balance"))
                                    .end()
                            )
                            .as("spendable_balance"),
                        eb.fn
                            .sum<string>(
                                eb
                                    .case()
                                    .when("accounts.account_type", "=", "locked" as any)
                                    .then(eb.ref("account_balances.balance"))
                                    .else(0)
                                    .end()
                            )
                            .as("locked_balance"),
                    ])
                    .executeTakeFirst();

                // On-read envelope aggregates.
                //
                // `allocated` and `consumed` are scoped to the envelope's own
                // window: monthly → current calendar month (they reset each
                // period, no carry-over); rolling/goal → lifetime pool. The
                // displayed "Allocated / Spent" totals depend on that shape.
                //
                // `remaining` is the source of `unallocated` downstream and
                // is held = GREATEST(0, allocated − consumed), clamped so an
                // overspent envelope holds no cash and doesn't inflate the
                // unbudgeted pool. Matches `resolveSpaceUnallocated`.
                const envelopeRow = await sql<{
                    allocated: string;
                    consumed: string;
                    remaining: string;
                }>`
                    WITH period AS (
                        SELECT
                            e.id AS envelop_id,
                            e.cadence,
                            CASE e.cadence
                                WHEN 'none' THEN DATE '1970-01-01'
                                WHEN 'monthly' THEN DATE_TRUNC('month', NOW())::date
                            END AS p_start,
                            CASE e.cadence
                                WHEN 'none' THEN DATE '9999-12-31'
                                WHEN 'monthly' THEN (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::date
                            END AS p_end
                        FROM envelops e
                        WHERE e.space_id = ${input.spaceId}
                    ),
                    per_env AS (
                        SELECT
                            p.envelop_id,
                            p.cadence,
                            COALESCE((
                                SELECT SUM(a.amount)
                                FROM envelop_allocations a
                                WHERE a.envelop_id = p.envelop_id
                                  AND (
                                      (p.cadence = 'none' AND a.period_start IS NULL)
                                      OR (
                                          p.cadence <> 'none'
                                          AND a.period_start >= p.p_start
                                          AND a.period_start < p.p_end
                                      )
                                  )
                            ), 0) AS p_allocated,
                            COALESCE((
                                SELECT SUM(t.amount)
                                FROM transactions t
                                WHERE t.envelop_id = p.envelop_id
                                  AND t.type = 'expense'
                                  AND t.transaction_datetime >= p.p_start
                                  AND t.transaction_datetime < p.p_end
                            ), 0) AS p_consumed
                        FROM period p
                    )
                    SELECT
                        COALESCE(SUM(p_allocated), 0)::text AS allocated,
                        COALESCE(SUM(p_consumed), 0)::text AS consumed,
                        COALESCE(SUM(
                            GREATEST(0, p_allocated - p_consumed)
                        ), 0)::text AS remaining
                    FROM per_env
                `
                    .execute(trx)
                    .then((r) => r.rows[0]);

                // Period income / expense derived from actual money
                // movement through the space's accounts. Two views are
                // computed in one pass:
                //
                //   * `period*` — CASH FLOW. Includes cross-space
                //     transfer principal as inflow/outflow. The
                //     transaction's `space_id` column is a
                //     categorization tag (see spec §12), not a scope
                //     boundary; a transfer from outside into a scope
                //     account surfaces here as income even if the row
                //     was stamped with a different `space_id`. Internal
                //     transfers (both legs in scope) net to zero. Fees
                //     count as expense whenever the source is in scope.
                //
                //   * `operational*` — TRUE INCOME / EXPENSE. Excludes
                //     all transfer principal regardless of direction;
                //     keeps only `type='income'` deposits, `type='expense'`
                //     debits, `type='adjustment'`, and transfer fees
                //     (which are real money lost to the bank). Powers
                //     the "Income / Expense" labels on cards where
                //     users expect actual earnings vs spending — the
                //     cash variant is misleading there because moving
                //     money between a user's own accounts looks like
                //     "expense."
                const incomeExpenseRow = await sql<{
                    cash_income: string;
                    cash_expense: string;
                    operational_income: string;
                    operational_expense: string;
                }>`
                    WITH scope_accounts AS (
                        SELECT sa.account_id
                        FROM space_accounts sa
                        WHERE sa.space_id = ${input.spaceId}
                    )
                    SELECT
                        COALESCE(SUM(CASE
                            WHEN type = 'income'
                                AND destination_account_id IN (SELECT account_id FROM scope_accounts) THEN amount
                            WHEN type = 'transfer'
                                AND destination_account_id IN (SELECT account_id FROM scope_accounts)
                                AND source_account_id NOT IN (SELECT account_id FROM scope_accounts) THEN amount
                            WHEN type = 'adjustment'
                                AND destination_account_id IN (SELECT account_id FROM scope_accounts) THEN amount
                            ELSE 0
                        END), 0)::text AS cash_income,
                        COALESCE(SUM(
                            CASE
                                WHEN type = 'expense'
                                    AND source_account_id IN (SELECT account_id FROM scope_accounts) THEN amount
                                WHEN type = 'transfer'
                                    AND source_account_id IN (SELECT account_id FROM scope_accounts)
                                    AND destination_account_id NOT IN (SELECT account_id FROM scope_accounts) THEN amount
                                WHEN type = 'adjustment'
                                    AND source_account_id IN (SELECT account_id FROM scope_accounts) THEN amount
                                ELSE 0
                            END
                        ), 0)::text AS cash_expense,
                        -- Operational income: only true type=income
                        -- deposits (and crediting adjustments) into
                        -- scope accounts. Transfer principal excluded.
                        COALESCE(SUM(CASE
                            WHEN type = 'income'
                                AND destination_account_id IN (SELECT account_id FROM scope_accounts) THEN amount
                            WHEN type = 'adjustment'
                                AND destination_account_id IN (SELECT account_id FROM scope_accounts) THEN amount
                            ELSE 0
                        END), 0)::text AS operational_income,
                        -- Operational expense: true type=expense debits
                        -- (which now include transfer fees as first-class
                        -- expense rows) + debiting adjustments. Transfer
                        -- principal excluded both directions.
                        COALESCE(SUM(
                            CASE
                                WHEN type = 'expense'
                                    AND source_account_id IN (SELECT account_id FROM scope_accounts) THEN amount
                                WHEN type = 'adjustment'
                                    AND source_account_id IN (SELECT account_id FROM scope_accounts) THEN amount
                                ELSE 0
                            END
                        ), 0)::text AS operational_expense
                    FROM transactions
                    WHERE transaction_datetime >= ${input.periodStart}
                      AND transaction_datetime < ${input.periodEnd}
                      AND (
                          source_account_id IN (SELECT account_id FROM scope_accounts)
                          OR destination_account_id IN (SELECT account_id FROM scope_accounts)
                      )
                `
                    .execute(trx)
                    .then((r) => r.rows[0]);

                const totalBalance = Number(balanceRow?.total_balance ?? 0);
                const spendableBalance = Number(balanceRow?.spendable_balance ?? 0);
                const lockedBalance = Number(balanceRow?.locked_balance ?? 0);
                const envelopeAllocated = Number(envelopeRow?.allocated ?? 0);
                const envelopeConsumed = Number(envelopeRow?.consumed ?? 0);
                const envelopeRemaining = Number(envelopeRow?.remaining ?? 0);
                const cashIncome = Number(incomeExpenseRow?.cash_income ?? 0);
                const cashExpense = Number(incomeExpenseRow?.cash_expense ?? 0);
                const operationalIncome = Number(
                    incomeExpenseRow?.operational_income ?? 0
                );
                const operationalExpense = Number(
                    incomeExpenseRow?.operational_expense ?? 0
                );

                const unallocated = spendableBalance - envelopeRemaining;

                return {
                    totalBalance,
                    spendableBalance,
                    lockedBalance,
                    envelopeAllocated,
                    envelopeConsumed,
                    envelopeRemaining,
                    unallocated,
                    isOverAllocated: unallocated < 0,
                    /* `period*` = cash flow (matches balance movement).
                       `operational*` = true income/expense (excludes
                       transfer principal). See SQL block above for the
                       precise classification rules. */
                    periodIncome: cashIncome,
                    periodExpense: cashExpense,
                    periodNet: cashIncome - cashExpense,
                    operationalIncome,
                    operationalExpense,
                    operationalNet: operationalIncome - operationalExpense,
                };
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute space summary",
            });
        }
        return result;
    });
