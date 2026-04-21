import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Per-envelope utilization for the given period window. Returns one row per
 * envelope with a `breakdown` array of per-account partition numbers. When
 * callers don't pass explicit period_start/period_end we use a large
 * enough window so cadence='none' envelopes include everything and monthly
 * envelopes still compute correctly on their own windows.
 *
 * For cadence='none' envelopes, allocations ignore period_start entirely.
 * For cadence='monthly' envelopes, only allocations whose effective
 * period_start falls in the requested window are counted.
 *
 * Carry-over: for envelopes with `carry_over = true` and cadence != 'none',
 * the previous period's clamped-to-≥0 remaining is included as `carryIn`
 * both on the top-level row and on each per-account breakdown row. The
 * "previous period" is the window of equal duration immediately before
 * `[periodStart, periodEnd)`. This keeps carryIn semantics aligned with
 * `resolveEnvelopePeriodBalance` so the Overview, Envelope detail, and
 * Account detail views all agree.
 */
export const envelopeUtilization = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            periodStart: z.coerce.date().optional(),
            periodEnd: z.coerce.date().optional(),
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

                const EPOCH = new Date("1970-01-01");
                const periodStart = input.periodStart ?? EPOCH;
                const periodEnd = input.periodEnd ?? new Date("9999-12-31");
                // Previous-period window = same duration immediately before
                // periodStart. For the usual month-wide query this is the
                // previous month; for arbitrary ranges it's the preceding
                // range of equal length. Clamp `prevStart` to epoch: when
                // the caller didn't pass bounds, the "current" window is
                // already all-time, so the previous window collapses to
                // [epoch, epoch) and carryIn is 0 — a Postgres date out of
                // range would otherwise crash the query.
                const durationMs = Math.max(
                    0,
                    periodEnd.getTime() - periodStart.getTime()
                );
                const prevStart = new Date(
                    Math.max(EPOCH.getTime(), periodStart.getTime() - durationMs)
                );
                const prevEnd = periodStart;

                // Envelope totals for the window (+ carryIn from prev period)
                const totalsQuery = sql<{
                    envelop_id: string;
                    name: string;
                    color: string;
                    icon: string;
                    description: string | null;
                    cadence: string;
                    carry_over: boolean;
                    allocated: string;
                    consumed: string;
                    carry_in: string;
                }>`
                    SELECT
                        e.id::text AS envelop_id,
                        e.name,
                        e.color,
                        e.icon,
                        e.description,
                        e.cadence,
                        e.carry_over,
                        COALESCE((
                            SELECT SUM(a.amount)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = e.id
                              AND (
                                  e.cadence = 'none'
                                  OR (
                                      COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= ${periodStart}::date
                                      AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < ${periodEnd}::date
                                  )
                              )
                        ), 0)::text AS allocated,
                        COALESCE((
                            SELECT SUM(entry.amount) FROM (
                                SELECT t.amount
                                FROM transactions t
                                JOIN expense_categories ec ON ec.id = t.expense_category_id
                                WHERE ec.envelop_id = e.id
                                  AND t.type = 'expense'
                                  AND t.transaction_datetime >= ${periodStart}
                                  AND t.transaction_datetime < ${periodEnd}
                                UNION ALL
                                -- Transfer fees consume the envelope their
                                -- category rolls up to, same as a regular
                                -- expense on the source account.
                                SELECT t.fee_amount AS amount
                                FROM transactions t
                                JOIN expense_categories ec ON ec.id = t.fee_expense_category_id
                                WHERE ec.envelop_id = e.id
                                  AND t.type = 'transfer'
                                  AND t.fee_amount IS NOT NULL
                                  AND t.transaction_datetime >= ${periodStart}
                                  AND t.transaction_datetime < ${periodEnd}
                            ) entry
                        ), 0)::text AS consumed,
                        CASE
                            WHEN e.cadence <> 'none' AND e.carry_over THEN GREATEST(0, (
                                COALESCE((
                                    SELECT SUM(a.amount)
                                    FROM envelop_allocations a
                                    WHERE a.envelop_id = e.id
                                      AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= ${prevStart}::date
                                      AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < ${prevEnd}::date
                                ), 0)
                                -
                                COALESCE((
                                    SELECT SUM(entry.amount) FROM (
                                        SELECT t.amount
                                        FROM transactions t
                                        JOIN expense_categories ec ON ec.id = t.expense_category_id
                                        WHERE ec.envelop_id = e.id
                                          AND t.type = 'expense'
                                          AND t.transaction_datetime >= ${prevStart}
                                          AND t.transaction_datetime < ${prevEnd}
                                        UNION ALL
                                        SELECT t.fee_amount AS amount
                                        FROM transactions t
                                        JOIN expense_categories ec ON ec.id = t.fee_expense_category_id
                                        WHERE ec.envelop_id = e.id
                                          AND t.type = 'transfer'
                                          AND t.fee_amount IS NOT NULL
                                          AND t.transaction_datetime >= ${prevStart}
                                          AND t.transaction_datetime < ${prevEnd}
                                    ) entry
                                ), 0)
                            ))
                            ELSE 0
                        END::text AS carry_in
                    FROM envelops e
                    WHERE e.space_id = ${input.spaceId}
                    ORDER BY e.created_at ASC
                `;
                const totals = (await totalsQuery.execute(trx)).rows;

                // Per-(envelope, account) breakdown for the same window
                // (current + previous, so we can compute per-partition carryIn)
                const breakdownQuery = sql<{
                    envelop_id: string;
                    account_id: string | null;
                    allocated: string;
                    consumed: string;
                    prev_allocated: string;
                    prev_consumed: string;
                    cadence: string;
                    carry_over: boolean;
                }>`
                    WITH alloc AS (
                        SELECT a.envelop_id,
                               a.account_id,
                               SUM(a.amount) AS amount
                        FROM envelop_allocations a
                        JOIN envelops e ON e.id = a.envelop_id
                        WHERE e.space_id = ${input.spaceId}
                          AND (
                              e.cadence = 'none'
                              OR (
                                  COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= ${periodStart}::date
                                  AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < ${periodEnd}::date
                              )
                          )
                        GROUP BY a.envelop_id, a.account_id
                    ),
                    spend AS (
                        SELECT envelop_id, account_id, SUM(amount) AS amount
                        FROM (
                            SELECT ec.envelop_id,
                                   t.source_account_id AS account_id,
                                   t.amount
                            FROM transactions t
                            JOIN expense_categories ec ON ec.id = t.expense_category_id
                            WHERE ec.space_id = ${input.spaceId}
                              AND t.type = 'expense'
                              AND t.transaction_datetime >= ${periodStart}
                              AND t.transaction_datetime < ${periodEnd}
                            UNION ALL
                            SELECT ec.envelop_id,
                                   t.source_account_id AS account_id,
                                   t.fee_amount AS amount
                            FROM transactions t
                            JOIN expense_categories ec ON ec.id = t.fee_expense_category_id
                            WHERE ec.space_id = ${input.spaceId}
                              AND t.type = 'transfer'
                              AND t.fee_amount IS NOT NULL
                              AND t.transaction_datetime >= ${periodStart}
                              AND t.transaction_datetime < ${periodEnd}
                        ) entries
                        GROUP BY envelop_id, account_id
                    ),
                    prev_alloc AS (
                        SELECT a.envelop_id,
                               a.account_id,
                               SUM(a.amount) AS amount
                        FROM envelop_allocations a
                        JOIN envelops e ON e.id = a.envelop_id
                        WHERE e.space_id = ${input.spaceId}
                          AND e.cadence <> 'none'
                          AND e.carry_over
                          AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= ${prevStart}::date
                          AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < ${prevEnd}::date
                        GROUP BY a.envelop_id, a.account_id
                    ),
                    prev_spend AS (
                        SELECT envelop_id, account_id, SUM(amount) AS amount
                        FROM (
                            SELECT ec.envelop_id,
                                   t.source_account_id AS account_id,
                                   t.amount
                            FROM transactions t
                            JOIN expense_categories ec ON ec.id = t.expense_category_id
                            JOIN envelops e ON e.id = ec.envelop_id
                            WHERE ec.space_id = ${input.spaceId}
                              AND e.cadence <> 'none'
                              AND e.carry_over
                              AND t.type = 'expense'
                              AND t.transaction_datetime >= ${prevStart}
                              AND t.transaction_datetime < ${prevEnd}
                            UNION ALL
                            SELECT ec.envelop_id,
                                   t.source_account_id AS account_id,
                                   t.fee_amount AS amount
                            FROM transactions t
                            JOIN expense_categories ec ON ec.id = t.fee_expense_category_id
                            JOIN envelops e ON e.id = ec.envelop_id
                            WHERE ec.space_id = ${input.spaceId}
                              AND e.cadence <> 'none'
                              AND e.carry_over
                              AND t.type = 'transfer'
                              AND t.fee_amount IS NOT NULL
                              AND t.transaction_datetime >= ${prevStart}
                              AND t.transaction_datetime < ${prevEnd}
                        ) entries
                        GROUP BY envelop_id, account_id
                    ),
                    merged AS (
                        SELECT envelop_id, account_id FROM alloc
                        UNION
                        SELECT envelop_id, account_id FROM spend
                        UNION
                        SELECT envelop_id, account_id FROM prev_alloc
                        UNION
                        SELECT envelop_id, account_id FROM prev_spend
                    )
                    SELECT
                        m.envelop_id::text AS envelop_id,
                        m.account_id::text AS account_id,
                        COALESCE(a.amount, 0)::text AS allocated,
                        COALESCE(s.amount, 0)::text AS consumed,
                        COALESCE(pa.amount, 0)::text AS prev_allocated,
                        COALESCE(ps.amount, 0)::text AS prev_consumed,
                        e.cadence,
                        e.carry_over
                    FROM merged m
                    JOIN envelops e ON e.id = m.envelop_id
                    LEFT JOIN alloc a
                      ON a.envelop_id = m.envelop_id
                     AND a.account_id IS NOT DISTINCT FROM m.account_id
                    LEFT JOIN spend s
                      ON s.envelop_id = m.envelop_id
                     AND s.account_id IS NOT DISTINCT FROM m.account_id
                    LEFT JOIN prev_alloc pa
                      ON pa.envelop_id = m.envelop_id
                     AND pa.account_id IS NOT DISTINCT FROM m.account_id
                    LEFT JOIN prev_spend ps
                      ON ps.envelop_id = m.envelop_id
                     AND ps.account_id IS NOT DISTINCT FROM m.account_id
                `;
                const breakdown = (await breakdownQuery.execute(trx)).rows;

                const breakdownByEnvelope = new Map<
                    string,
                    Array<{
                        accountId: string | null;
                        allocated: number;
                        consumed: number;
                        carryIn: number;
                        remaining: number;
                        isDrift: boolean;
                    }>
                >();
                for (const r of breakdown) {
                    const allocated = Number(r.allocated);
                    const consumed = Number(r.consumed);
                    const prevAllocated = Number(r.prev_allocated);
                    const prevConsumed = Number(r.prev_consumed);
                    const carryIn =
                        r.cadence !== "none" && r.carry_over
                            ? Math.max(0, prevAllocated - prevConsumed)
                            : 0;
                    const remaining = carryIn + allocated - consumed;
                    const row = {
                        accountId: r.account_id,
                        allocated,
                        consumed,
                        carryIn,
                        remaining,
                        isDrift: remaining < 0,
                    };
                    const arr = breakdownByEnvelope.get(r.envelop_id) ?? [];
                    arr.push(row);
                    breakdownByEnvelope.set(r.envelop_id, arr);
                }

                return totals.map((t) => {
                    const allocated = Number(t.allocated);
                    const consumed = Number(t.consumed);
                    const carryIn = Number(t.carry_in);
                    const remaining = carryIn + allocated - consumed;
                    return {
                        envelopId: t.envelop_id,
                        name: t.name,
                        color: t.color,
                        icon: t.icon,
                        description: t.description,
                        cadence: t.cadence as "none" | "monthly",
                        carryOver: t.carry_over,
                        allocated,
                        consumed,
                        carryIn,
                        remaining,
                        isDrift: remaining < 0,
                        breakdown: breakdownByEnvelope.get(t.envelop_id) ?? [],
                    };
                });
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute envelope utilization",
            });
        }
        return result;
    });
