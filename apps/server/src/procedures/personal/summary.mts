import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

/**
 * Cross-space personal summary — same shape as analytics.spaceSummary
 * (balance / spendable / locked / envelope / unallocated /
 * period income & expense) so the existing OverviewPage and all its
 * downstream UI can render unchanged when the virtual space is active.
 *
 * Semantics are anchored to the caller's personally-owned accounts
 * (user_accounts.role='owner') unioned across every space they're a
 * member of. Envelope aggregates sum only the partitions belonging
 * to owned accounts — "my slice" of each budget I participate in.
 * Goal envelopes (cadence='none' with target) ride the same rules:
 * their balance contributes to envelopeRemaining like any other
 * rolling envelope.
 *
 * Cash-flow semantics (mirrors personal.cashFlow):
 *   - income/adjustment to an owned account        → personal inflow
 *   - expense/adjustment from an owned account     → personal outflow
 *   - transfer owned → non-owned                   → personal outflow
 *   - transfer non-owned → owned                   → personal inflow
 *   - transfer owned → owned (internal rebalance)  → excluded
 */
export const personalSummary = authorizedProcedure
    .input(
        z.object({
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            (async () => {
                const owned = await resolveOwnedAccountIds(
                    ctx.services.qb,
                    ctx.auth.user.id
                );
                const memberSpaces = await resolveMemberSpaceIds(
                    ctx.services.qb,
                    ctx.auth.user.id
                );

                if (owned.length === 0 || memberSpaces.length === 0) {
                    return {
                        totalBalance: 0,
                        spendableBalance: 0,
                        lockedBalance: 0,
                        envelopeAllocated: 0,
                        envelopeConsumed: 0,
                        envelopeRemaining: 0,
                        unallocated: 0,
                        isOverAllocated: false,
                        periodIncome: 0,
                        periodExpense: 0,
                        periodNet: 0,
                        operationalIncome: 0,
                        operationalExpense: 0,
                        operationalNet: 0,
                        ownedAccountsCount: owned.length,
                        memberSpacesCount: memberSpaces.length,
                    };
                }

                const balanceRow = await sql<{
                    total_balance: string;
                    spendable_balance: string;
                    locked_balance: string;
                }>`
                    SELECT
                        COALESCE(SUM(
                            CASE a.account_type
                                WHEN 'liability' THEN -ab.balance
                                ELSE ab.balance
                            END
                        ), 0)::text AS total_balance,
                        COALESCE(SUM(
                            CASE a.account_type
                                WHEN 'liability' THEN -ab.balance
                                WHEN 'locked' THEN 0
                                ELSE ab.balance
                            END
                        ), 0)::text AS spendable_balance,
                        COALESCE(SUM(
                            CASE a.account_type
                                WHEN 'locked' THEN ab.balance
                                ELSE 0
                            END
                        ), 0)::text AS locked_balance
                    FROM account_balances ab
                    JOIN accounts a ON a.id = ab.account_id
                    WHERE ab.account_id = ANY(${owned})
                `
                    .execute(ctx.services.qb)
                    .then((r) => r.rows[0]);

                // Envelope aggregates: allocation is space-wide (no per-
                // account dimension), so p_allocated is the envelope's full
                // current-period allocation; p_consumed is owned-account
                // spend. Monthly envelopes reset each period; rolling/goal
                // use the lifetime pool. No carry-over. Held = GREATEST(0,
                // allocated − consumed). Matches analytics.spaceSummary.
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
                        WHERE e.space_id = ANY(${memberSpaces})
                    ),
                    per_env AS (
                        SELECT
                            p.envelop_id,
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
                            -- Consumption unions transfer fees that roll up
                            -- to this envelope's category — matches the
                            -- analytics formula so OverviewPage and
                            -- EnvelopesView reconcile.
                            COALESCE((
                                SELECT SUM(t.amount)
                                FROM transactions t
                                WHERE t.envelop_id = p.envelop_id
                                  AND t.type = 'expense'
                                  AND t.source_account_id = ANY(${owned})
                                  AND t.transaction_datetime >= p.p_start
                                  AND t.transaction_datetime < p.p_end
                            ), 0) AS p_consumed
                        FROM period p
                    )
                    SELECT
                        COALESCE(SUM(p_allocated), 0)::text AS allocated,
                        COALESCE(SUM(p_consumed), 0)::text AS consumed,
                        COALESCE(SUM(GREATEST(0, p_allocated - p_consumed)), 0)::text AS remaining
                    FROM per_env
                `
                    .execute(ctx.services.qb)
                    .then((r) => r.rows[0]);

                /* Personal flow — two views computed in one pass:
                 *
                 * `cash_*` — CASH FLOW. Owned↔owned transfers excluded
                 *   (internal rebalance, net zero). Owned↔non-owned
                 *   transfer principal counts directionally as
                 *   inflow/outflow. Fees count as outflow whenever the
                 *   source is owned.
                 *
                 * `operational_*` — TRUE INCOME / EXPENSE. Excludes ALL
                 *   transfer principal regardless of direction. Keeps
                 *   only `type='income'` deposits, `type='expense'`
                 *   debits, `type='adjustment'`, and transfer fees.
                 */
                const flowRow = await sql<{
                    cash_income: string;
                    cash_expense: string;
                    operational_income: string;
                    operational_expense: string;
                }>`
                    SELECT
                        COALESCE(SUM(CASE
                            WHEN type = 'income' AND destination_account_id = ANY(${owned}) THEN amount
                            WHEN type = 'transfer'
                                AND destination_account_id = ANY(${owned})
                                AND source_account_id <> ALL(${owned}) THEN amount
                            WHEN type = 'adjustment' AND destination_account_id = ANY(${owned}) THEN amount
                            ELSE 0
                        END), 0)::text AS cash_income,
                        COALESCE(SUM(
                            CASE
                                WHEN type = 'expense' AND source_account_id = ANY(${owned}) THEN amount
                                WHEN type = 'transfer'
                                    AND source_account_id = ANY(${owned})
                                    AND destination_account_id <> ALL(${owned}) THEN amount
                                WHEN type = 'adjustment' AND source_account_id = ANY(${owned}) THEN amount
                                ELSE 0
                            END
                        ), 0)::text AS cash_expense,
                        COALESCE(SUM(CASE
                            WHEN type = 'income' AND destination_account_id = ANY(${owned}) THEN amount
                            WHEN type = 'adjustment' AND destination_account_id = ANY(${owned}) THEN amount
                            ELSE 0
                        END), 0)::text AS operational_income,
                        COALESCE(SUM(
                            CASE
                                WHEN type = 'expense' AND source_account_id = ANY(${owned}) THEN amount
                                WHEN type = 'adjustment' AND source_account_id = ANY(${owned}) THEN amount
                                ELSE 0
                            END
                        ), 0)::text AS operational_expense
                    FROM transactions
                    WHERE space_id = ANY(${memberSpaces})
                      AND transaction_datetime >= ${input.periodStart}
                      AND transaction_datetime < ${input.periodEnd}
                      AND (
                          source_account_id = ANY(${owned})
                          OR destination_account_id = ANY(${owned})
                      )
                `
                    .execute(ctx.services.qb)
                    .then((r) => r.rows[0]);

                const totalBalance = Number(balanceRow?.total_balance ?? 0);
                const spendableBalance = Number(balanceRow?.spendable_balance ?? 0);
                const lockedBalance = Number(balanceRow?.locked_balance ?? 0);
                const envelopeAllocated = Number(envelopeRow?.allocated ?? 0);
                const envelopeConsumed = Number(envelopeRow?.consumed ?? 0);
                const envelopeRemaining = Number(envelopeRow?.remaining ?? 0);
                const cashIncome = Number(flowRow?.cash_income ?? 0);
                const cashExpense = Number(flowRow?.cash_expense ?? 0);
                const operationalIncome = Number(
                    flowRow?.operational_income ?? 0
                );
                const operationalExpense = Number(
                    flowRow?.operational_expense ?? 0
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
                    /* `period*` = cash flow. `operational*` = excludes
                       all transfer principal. See SQL block above. */
                    periodIncome: cashIncome,
                    periodExpense: cashExpense,
                    periodNet: cashIncome - cashExpense,
                    operationalIncome,
                    operationalExpense,
                    operationalNet: operationalIncome - operationalExpense,
                    ownedAccountsCount: owned.length,
                    memberSpacesCount: memberSpaces.length,
                };
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute personal summary",
            });
        }
        return result;
    });
