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
                    carry_policy: string;
                    archived: boolean;
                    target_amount: string | null;
                    target_date: Date | null;
                    first_allocated_at: Date | null;
                    last_allocated_at: Date | null;
                    lifetime_funded: string;
                    allocated: string;
                    consumed: string;
                    carry_in: string;
                    borrowed_in: string;
                    borrowed_out: string;
                    lifetime_overrun: string;
                }>`
                    SELECT
                        e.id::text AS envelop_id,
                        e.name,
                        e.color,
                        e.icon,
                        e.description,
                        e.cadence,
                        e.carry_over,
                        e.carry_policy,
                        e.archived,
                        e.target_amount,
                        e.target_date,
                        (
                            SELECT MIN(a.created_at)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = e.id
                        ) AS first_allocated_at,
                        (
                            SELECT MAX(a.created_at)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = e.id
                        ) AS last_allocated_at,
                        -- Cumulative positive allocations: the goal-progress
                        -- numerator. Excludes negative rows (withdrawals,
                        -- deallocations) so that *spending* from a goal
                        -- doesn't unwind its completion status. Filtered
                        -- to user-funding kinds so future 'cover' /
                        -- 'reckon' / 'restructure' writers can't inflate
                        -- goal progress with envelope-to-envelope
                        -- reallocations.
                        COALESCE((
                            SELECT SUM(a.amount)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = e.id
                              AND a.amount > 0
                              AND a.kind IN ('allocate', 'borrow')
                        ), 0)::text AS lifetime_funded,
                        -- Borrow rows that landed IN this period (positive
                        -- amounts paired via borrowed_link_id). UI uses
                        -- this to surface "+$X borrowed from next month"
                        -- on the period's planning view.
                        COALESCE((
                            SELECT SUM(a.amount)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = e.id
                              AND a.borrowed_link_id IS NOT NULL
                              AND a.amount > 0
                              AND COALESCE(
                                    a.period_start,
                                    DATE_TRUNC('month', a.created_at)::date
                                  ) >= ${periodStart}::date
                              AND COALESCE(
                                    a.period_start,
                                    DATE_TRUNC('month', a.created_at)::date
                                  ) < ${periodEnd}::date
                        ), 0)::text AS borrowed_in,
                        -- Borrow rows OWED OUT of this period (negative
                        -- amounts; the abs value is what a previous
                        -- period borrowed from this one). Surfaces as
                        -- "−$X borrowed out" so the user remembers a
                        -- past period already drew on this one.
                        COALESCE((
                            SELECT SUM(-a.amount)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = e.id
                              AND a.borrowed_link_id IS NOT NULL
                              AND a.amount < 0
                              AND COALESCE(
                                    a.period_start,
                                    DATE_TRUNC('month', a.created_at)::date
                                  ) >= ${periodStart}::date
                              AND COALESCE(
                                    a.period_start,
                                    DATE_TRUNC('month', a.created_at)::date
                                  ) < ${periodEnd}::date
                        ), 0)::text AS borrowed_out,
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
                        /* For cadence='none' (rolling) envelopes, consumed
                           is LIFETIME -- they have no monthly reset, so a
                           period-scoped consumed alongside lifetime
                           allocated produces a hybrid that disagrees
                           with spaceSummary's lifetime view and creates
                           Net Worth vs Unbudgeted mismatches. Mirrors
                           the same cadence='none' OR period-match
                           predicate the allocated aggregate above uses. */
                        COALESCE((
                            SELECT SUM(t.amount)
                            FROM transactions t
                            WHERE t.envelop_id = e.id
                              AND t.type = 'expense'
                              AND (
                                  e.cadence = 'none'
                                  OR (
                                      t.transaction_datetime >= ${periodStart}
                                      AND t.transaction_datetime < ${periodEnd}
                                  )
                              )
                        ), 0)::text AS consumed,
                        -- carry_in honors the three-mode carry_policy:
                        --   'reset'         → 0
                        --   'positive_only' → GREATEST(0, prev_remaining)
                        --   'both'          → prev_remaining (signed; debt persists)
                        -- cadence='none' envelopes never carry (single rolling window).
                        CASE
                            WHEN e.cadence = 'none' OR e.carry_policy = 'reset' THEN 0
                            ELSE (
                                CASE
                                    WHEN e.carry_policy = 'both' THEN (
                                        COALESCE((
                                            SELECT SUM(a.amount)
                                            FROM envelop_allocations a
                                            WHERE a.envelop_id = e.id
                                              AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= ${prevStart}::date
                                              AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < ${prevEnd}::date
                                        ), 0)
                                        -
                                        COALESCE((
                                            SELECT SUM(t.amount)
                                            FROM transactions t
                                            WHERE t.envelop_id = e.id
                                              AND t.type = 'expense'
                                              AND t.transaction_datetime >= ${prevStart}
                                              AND t.transaction_datetime < ${prevEnd}
                                        ), 0)
                                    )
                                    ELSE GREATEST(0, (
                                        COALESCE((
                                            SELECT SUM(a.amount)
                                            FROM envelop_allocations a
                                            WHERE a.envelop_id = e.id
                                              AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= ${prevStart}::date
                                              AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < ${prevEnd}::date
                                        ), 0)
                                        -
                                        COALESCE((
                                            SELECT SUM(t.amount)
                                            FROM transactions t
                                            WHERE t.envelop_id = e.id
                                              AND t.type = 'expense'
                                              AND t.transaction_datetime >= ${prevStart}
                                              AND t.transaction_datetime < ${prevEnd}
                                        ), 0)
                                    ))
                                END
                            )
                        END::text AS carry_in,
                        -- Lifetime overrun: how far the envelope is in the
                        -- red across all time. Only meaningful for rolling
                        -- (cadence='none') envelopes — monthly envelopes
                        -- already express overspend via carry_policy +
                        -- carry_in. Surfaced as a positive number when
                        -- lifetime consumed > lifetime allocated.
                        --
                        -- LEDGER-REPLACEABLE: this field is a stop-gap
                        -- cue. Once the envelop_allocations ledger gains
                        -- first-class 'reckon' / 'restructure' kinds, the
                        -- overrun becomes derivable as the absence of a
                        -- reckon row plus the running sum — at which
                        -- point this column and its UI pills retire.
                        CASE WHEN e.cadence = 'none' THEN
                            GREATEST(
                                0,
                                COALESCE((
                                    SELECT SUM(t.amount)
                                    FROM transactions t
                                    WHERE t.envelop_id = e.id AND t.type = 'expense'
                                ), 0)
                                -
                                COALESCE((
                                    SELECT SUM(a.amount)
                                    FROM envelop_allocations a
                                    WHERE a.envelop_id = e.id
                                ), 0)
                            )
                        ELSE 0 END::text AS lifetime_overrun
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
                    carry_policy: string;
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
                        /* Lifetime spend for rolling envelopes; period-
                           scoped for monthly — matches the top-level
                           aggregate's rule. */
                        SELECT t.envelop_id, t.source_account_id AS account_id, SUM(t.amount) AS amount
                        FROM transactions t
                        JOIN envelops e ON e.id = t.envelop_id
                        WHERE t.space_id = ${input.spaceId}
                          AND t.type = 'expense'
                          AND (
                              e.cadence = 'none'
                              OR (
                                  t.transaction_datetime >= ${periodStart}
                                  AND t.transaction_datetime < ${periodEnd}
                              )
                          )
                        GROUP BY t.envelop_id, t.source_account_id
                    ),
                    prev_alloc AS (
                        SELECT a.envelop_id,
                               a.account_id,
                               SUM(a.amount) AS amount
                        FROM envelop_allocations a
                        JOIN envelops e ON e.id = a.envelop_id
                        WHERE e.space_id = ${input.spaceId}
                          AND e.cadence <> 'none'
                          AND e.carry_policy <> 'reset'
                          AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= ${prevStart}::date
                          AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < ${prevEnd}::date
                        GROUP BY a.envelop_id, a.account_id
                    ),
                    prev_spend AS (
                        SELECT t.envelop_id, t.source_account_id AS account_id, SUM(t.amount) AS amount
                        FROM transactions t
                        JOIN envelops e ON e.id = t.envelop_id
                        WHERE t.space_id = ${input.spaceId}
                          AND e.cadence <> 'none'
                          AND e.carry_policy <> 'reset'
                          AND t.type = 'expense'
                          AND t.transaction_datetime >= ${prevStart}
                          AND t.transaction_datetime < ${prevEnd}
                        GROUP BY t.envelop_id, t.source_account_id
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
                        e.carry_policy
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
                        r.cadence === "none" || r.carry_policy === "reset"
                            ? 0
                            : r.carry_policy === "both"
                              ? prevAllocated - prevConsumed
                              : Math.max(0, prevAllocated - prevConsumed);
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
                    const targetAmount =
                        t.target_amount != null ? Number(t.target_amount) : null;
                    const lifetimeFunded = Number(t.lifetime_funded);
                    // pctSaved is the goal-progress signal: cumulative
                    // positive allocations over target, clamped to 100.
                    // Spending money out of the goal does not reverse
                    // progress — completing a goal stays completed.
                    const pctSaved =
                        targetAmount != null && targetAmount > 0
                            ? Math.max(
                                  0,
                                  Math.min(100, (lifetimeFunded / targetAmount) * 100)
                              )
                            : null;
                    return {
                        envelopId: t.envelop_id,
                        name: t.name,
                        color: t.color,
                        icon: t.icon,
                        description: t.description,
                        cadence: t.cadence as "none" | "monthly",
                        carryOver: t.carry_over,
                        carryPolicy: t.carry_policy as
                            | "reset"
                            | "positive_only"
                            | "both",
                        archived: t.archived,
                        targetAmount,
                        targetDate: t.target_date,
                        lifetimeFunded,
                        pctSaved,
                        // Legacy alias retained for any reader still on
                        // the old name; new callers should read pctSaved.
                        pctComplete: pctSaved,
                        firstAllocatedAt: t.first_allocated_at,
                        lastAllocatedAt: t.last_allocated_at,
                        allocated,
                        consumed,
                        carryIn,
                        remaining,
                        borrowedIn: Number(t.borrowed_in),
                        borrowedOut: Number(t.borrowed_out),
                        // Lifetime overrun on rolling envelopes (zero for
                        // monthly). When > 0, the envelope has consumed more
                        // than it's allocated across all time — UI surfaces
                        // this with a "Net overspent" pill.
                        lifetimeOverrun: Number(t.lifetime_overrun),
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
