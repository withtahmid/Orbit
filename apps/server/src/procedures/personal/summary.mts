import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

/**
 * Cross-space personal summary — same shape as analytics.spaceSummary
 * (balance / spendable / locked / envelope / plan / unallocated /
 * period income & expense) so the existing OverviewPage and all its
 * downstream UI can render unchanged when the virtual space is active.
 *
 * Semantics are anchored to the caller's personally-owned accounts
 * (user_accounts.role='owner') unioned across every space they're a
 * member of. Envelope and plan aggregates sum only the partitions
 * belonging to owned accounts — "my slice" of each budget I
 * participate in.
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
                        planAllocated: 0,
                        unallocated: 0,
                        isOverAllocated: false,
                        periodIncome: 0,
                        periodExpense: 0,
                        periodNet: 0,
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

                // Envelope aggregates restricted to owned-account
                // partitions — current-period allocated/consumed plus
                // carry-in from the immediately-preceding equal-length
                // window (same math as envelopeUtilization, summed).
                const envelopeRow = await sql<{
                    allocated: string;
                    consumed: string;
                    remaining: string;
                }>`
                    WITH period AS (
                        SELECT
                            e.id AS envelop_id,
                            e.cadence,
                            e.carry_over,
                            CASE e.cadence
                                WHEN 'none' THEN DATE '1970-01-01'
                                WHEN 'monthly' THEN DATE_TRUNC('month', NOW())::date
                            END AS p_start,
                            CASE e.cadence
                                WHEN 'none' THEN DATE '9999-12-31'
                                WHEN 'monthly' THEN (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::date
                            END AS p_end,
                            CASE e.cadence
                                WHEN 'monthly' THEN (DATE_TRUNC('month', NOW()) - INTERVAL '1 month')::date
                                ELSE NULL
                            END AS prev_start,
                            CASE e.cadence
                                WHEN 'monthly' THEN DATE_TRUNC('month', NOW())::date
                                ELSE NULL
                            END AS prev_end
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
                                  AND a.account_id = ANY(${owned})
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
                                JOIN expense_categories ec ON ec.id = t.expense_category_id
                                WHERE ec.envelop_id = p.envelop_id
                                  AND t.type = 'expense'
                                  AND t.source_account_id = ANY(${owned})
                                  AND t.transaction_datetime >= p.p_start
                                  AND t.transaction_datetime < p.p_end
                            ), 0) AS p_consumed,
                            CASE
                                WHEN p.cadence <> 'none' AND p.carry_over THEN GREATEST(0, (
                                    COALESCE((
                                        SELECT SUM(a.amount)
                                        FROM envelop_allocations a
                                        WHERE a.envelop_id = p.envelop_id
                                          AND a.account_id = ANY(${owned})
                                          AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= p.prev_start
                                          AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < p.prev_end
                                    ), 0)
                                    -
                                    COALESCE((
                                        SELECT SUM(t.amount)
                                        FROM transactions t
                                        JOIN expense_categories ec ON ec.id = t.expense_category_id
                                        WHERE ec.envelop_id = p.envelop_id
                                          AND t.type = 'expense'
                                          AND t.source_account_id = ANY(${owned})
                                          AND t.transaction_datetime >= p.prev_start
                                          AND t.transaction_datetime < p.prev_end
                                    ), 0)
                                ))
                                ELSE 0
                            END AS p_carry_in
                        FROM period p
                    )
                    SELECT
                        COALESCE(SUM(p_allocated), 0)::text AS allocated,
                        COALESCE(SUM(p_consumed), 0)::text AS consumed,
                        COALESCE(SUM(GREATEST(0, p_allocated + p_carry_in - p_consumed)), 0)::text AS remaining
                    FROM per_env
                `
                    .execute(ctx.services.qb)
                    .then((r) => r.rows[0]);

                const planRow = await sql<{ allocated: string }>`
                    SELECT
                        COALESCE(SUM(pa.amount), 0)::text AS allocated
                    FROM plan_allocations pa
                    JOIN plans p ON p.id = pa.plan_id
                    WHERE p.space_id = ANY(${memberSpaces})
                      AND pa.account_id = ANY(${owned})
                `
                    .execute(ctx.services.qb)
                    .then((r) => r.rows[0]);

                const flowRow = await sql<{
                    income: string;
                    expense: string;
                }>`
                    SELECT
                        COALESCE(SUM(CASE
                            WHEN type = 'income' AND destination_account_id = ANY(${owned}) THEN amount
                            WHEN type = 'transfer'
                                AND destination_account_id = ANY(${owned})
                                AND source_account_id <> ALL(${owned}) THEN amount
                            WHEN type = 'adjustment' AND destination_account_id = ANY(${owned}) THEN amount
                            ELSE 0
                        END), 0)::text AS income,
                        COALESCE(SUM(
                            CASE
                                WHEN type = 'expense' AND source_account_id = ANY(${owned}) THEN amount
                                WHEN type = 'transfer'
                                    AND source_account_id = ANY(${owned})
                                    AND destination_account_id <> ALL(${owned}) THEN amount
                                WHEN type = 'adjustment' AND source_account_id = ANY(${owned}) THEN amount
                                ELSE 0
                            END
                            + CASE
                                WHEN type = 'transfer'
                                    AND source_account_id = ANY(${owned})
                                    AND fee_amount IS NOT NULL THEN fee_amount
                                ELSE 0
                            END
                        ), 0)::text AS expense
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
                const planAllocated = Number(planRow?.allocated ?? 0);
                const income = Number(flowRow?.income ?? 0);
                const expense = Number(flowRow?.expense ?? 0);

                const unallocated =
                    spendableBalance - envelopeRemaining - planAllocated;

                return {
                    totalBalance,
                    spendableBalance,
                    lockedBalance,
                    envelopeAllocated,
                    envelopeConsumed,
                    envelopeRemaining,
                    planAllocated,
                    unallocated,
                    isOverAllocated: unallocated < 0,
                    periodIncome: income,
                    periodExpense: expense,
                    periodNet: income - expense,
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
