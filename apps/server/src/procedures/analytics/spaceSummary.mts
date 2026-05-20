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
                // `allocated` and `consumed` stay scoped to the envelope's
                // own window (monthly → current calendar month; rolling →
                // lifetime). The displayed "Allocated / Spent" totals depend
                // on that shape.
                //
                // `remaining` is the source of `unallocated` downstream, so
                // it needs to honor a subtle property: for a `cadence='none'`
                // (rolling) envelope that has been historically overspent,
                // the lifetime clamp `max(0, alloc − consumed)` evaluates to
                // 0 and a fresh in-period allocation surplus would silently
                // surface as untraceable "Unbudgeted" cash. To prevent
                // that, rolling envelopes also compute a period-scoped
                // overlay using the request's `periodStart`/`periodEnd`,
                // and the held value is the MAX of the lifetime-clamped and
                // period-clamped values. Monthly envelopes are unchanged.
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
                            END AS p_end,
                            -- Period overlay window for rolling envelopes —
                            -- the dashboard's selected period. Ignored for
                            -- monthly envelopes since their p_start/p_end is
                            -- already the relevant scope.
                            ${input.periodStart}::date AS overlay_start,
                            ${input.periodEnd}::date AS overlay_end
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
                                      p.cadence = 'none'
                                      OR (
                                          COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= p.p_start
                                          AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < p.p_end
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
                            ), 0) AS p_consumed,
                            -- Period-scoped overlay; only meaningful when
                            -- cadence='none'. For monthly envelopes the
                            -- main p_allocated/p_consumed already match this
                            -- window so the overlay would be redundant.
                            CASE WHEN p.cadence = 'none' THEN
                                COALESCE((
                                    SELECT SUM(a.amount)
                                    FROM envelop_allocations a
                                    WHERE a.envelop_id = p.envelop_id
                                      AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= p.overlay_start
                                      AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < p.overlay_end
                                ), 0)
                            ELSE 0 END AS overlay_allocated,
                            CASE WHEN p.cadence = 'none' THEN
                                COALESCE((
                                    SELECT SUM(t.amount)
                                    FROM transactions t
                                    WHERE t.envelop_id = p.envelop_id
                                      AND t.type = 'expense'
                                      AND t.transaction_datetime >= p.overlay_start
                                      AND t.transaction_datetime < p.overlay_end
                                ), 0)
                            ELSE 0 END AS overlay_consumed
                        FROM period p
                    )
                    SELECT
                        COALESCE(SUM(p_allocated), 0)::text AS allocated,
                        COALESCE(SUM(p_consumed), 0)::text AS consumed,
                        -- Rolling-envelope held: deliberate one-sided MAX.
                        -- Lifetime cushion absorbs a single-period overspend
                        -- silently — that's the rolling envelope contract.
                        -- A user who overspends Eid 26 by 14 in May while
                        -- still holding 1000 of lifetime intent does NOT
                        -- see Unbudgeted react; the dashboard treats the
                        -- envelope's bottomless-pool as the source of truth
                        -- and the period dip stays inside the envelope.
                        -- The reverse case (Eid 26 lifetime overspent, May
                        -- intent positive) is the bug this fix was for:
                        -- period-positive recovers held from the lifetime
                        -- clamp via the overlay branch.
                        -- If we ever want period overspend to surface for
                        -- rolling envelopes, replace with:
                        --   GREATEST(0, p_alloc - p_consumed
                        --     - MAX(0, overlay_consumed - overlay_alloc))
                        COALESCE(SUM(
                            CASE WHEN cadence = 'none' THEN
                                GREATEST(
                                    GREATEST(0, p_allocated - p_consumed),
                                    GREATEST(0, overlay_allocated - overlay_consumed)
                                )
                            ELSE
                                GREATEST(0, p_allocated - p_consumed)
                            END
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
