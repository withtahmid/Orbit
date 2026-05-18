import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

/**
 * Personal (cross-space) envelope utilization. Lists every envelope
 * that lives in a space the caller is a member of, with allocated /
 * consumed / remaining summed over the caller's owned-account
 * partitions only — "my slice" of each envelope I participate in.
 * Partition breakdown rows are also filtered to owned accounts.
 *
 * Mirrors analytics.envelopeUtilization's carry-over semantics so the
 * virtual-space envelope view reconciles with what the user sees on
 * each real space's envelope page (restricted to their own partition).
 */
export const personalEnvelopeUtilization = authorizedProcedure
    .input(
        z.object({
            periodStart: z.coerce.date().optional(),
            periodEnd: z.coerce.date().optional(),
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
                if (memberSpaces.length === 0) return [];

                const EPOCH = new Date("1970-01-01");
                const periodStart = input.periodStart ?? EPOCH;
                const periodEnd = input.periodEnd ?? new Date("9999-12-31");
                const durationMs = Math.max(
                    0,
                    periodEnd.getTime() - periodStart.getTime()
                );
                const prevStart = new Date(
                    Math.max(EPOCH.getTime(), periodStart.getTime() - durationMs)
                );
                const prevEnd = periodStart;

                // A user with zero owned accounts has no personal slice
                // of any envelope — short-circuit. The previous sentinel
                // approach incorrectly counted space-wide allocations
                // (account_id IS NULL) while zeroing consumed, producing
                // a phantom "allocated, 0 spent" row in personal views.
                if (owned.length === 0) return [];
                const ownedParam = owned;

                const totalsQuery = sql<{
                    envelop_id: string;
                    space_id: string;
                    space_name: string;
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
                        e.space_id::text AS space_id,
                        s.name AS space_name,
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
                              AND (a.account_id IS NULL OR a.account_id = ANY(${ownedParam}))
                        ) AS first_allocated_at,
                        (
                            SELECT MAX(a.created_at)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = e.id
                              AND (a.account_id IS NULL OR a.account_id = ANY(${ownedParam}))
                        ) AS last_allocated_at,
                        -- Lifetime funded (positive allocations only) is
                        -- the goal-progress numerator. Spending from a
                        -- completed goal does not roll back its status.
                        -- Filtered to user-funding kinds; see
                        -- analytics/envelopeUtilization.mts for rationale.
                        COALESCE((
                            SELECT SUM(a.amount)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = e.id
                              AND a.amount > 0
                              AND a.kind IN ('allocate', 'borrow')
                              AND (a.account_id IS NULL OR a.account_id = ANY(${ownedParam}))
                        ), 0)::text AS lifetime_funded,
                        -- Borrow-link rows touching this period. Allocations
                        -- are now space-wide (account_id IS NULL); legacy
                        -- pinned rows are still counted when pinned to an
                        -- owned account so personal totals stay correct
                        -- across the migration boundary.
                        COALESCE((
                            SELECT SUM(a.amount)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = e.id
                              AND a.borrowed_link_id IS NOT NULL
                              AND a.amount > 0
                              AND (a.account_id IS NULL OR a.account_id = ANY(${ownedParam}))
                              AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= ${periodStart}::date
                              AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < ${periodEnd}::date
                        ), 0)::text AS borrowed_in,
                        COALESCE((
                            SELECT SUM(-a.amount)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = e.id
                              AND a.borrowed_link_id IS NOT NULL
                              AND a.amount < 0
                              AND (a.account_id IS NULL OR a.account_id = ANY(${ownedParam}))
                              AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= ${periodStart}::date
                              AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < ${periodEnd}::date
                        ), 0)::text AS borrowed_out,
                        COALESCE((
                            SELECT SUM(a.amount)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = e.id
                              AND (a.account_id IS NULL OR a.account_id = ANY(${ownedParam}))
                              AND (
                                  e.cadence = 'none'
                                  OR (
                                      COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= ${periodStart}::date
                                      AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < ${periodEnd}::date
                                  )
                              )
                        ), 0)::text AS allocated,
                        /* For cadence='none' (rolling) envelopes, consumed
                           is LIFETIME — see analytics/envelopeUtilization.mts
                           for rationale. Owned-account scoping is preserved
                           via source_account_id = ANY(ownedParam). */
                        COALESCE((
                            SELECT SUM(t.amount)
                            FROM transactions t
                            WHERE t.envelop_id = e.id
                              AND t.type = 'expense'
                              AND t.source_account_id = ANY(${ownedParam})
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
                        --   'positive_only' → max(0, prev_remaining)
                        --   'both'          → prev_remaining (signed; debt persists)
                        CASE
                            WHEN e.cadence = 'none' OR e.carry_policy = 'reset' THEN 0
                            WHEN e.carry_policy = 'both' THEN (
                                COALESCE((
                                    SELECT SUM(a.amount)
                                    FROM envelop_allocations a
                                    WHERE a.envelop_id = e.id
                                      AND (a.account_id IS NULL OR a.account_id = ANY(${ownedParam}))
                                      AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= ${prevStart}::date
                                      AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < ${prevEnd}::date
                                ), 0)
                                -
                                COALESCE((
                                    SELECT SUM(t.amount)
                                    FROM transactions t
                                    WHERE t.envelop_id = e.id
                                      AND t.type = 'expense'
                                      AND t.source_account_id = ANY(${ownedParam})
                                      AND t.transaction_datetime >= ${prevStart}
                                      AND t.transaction_datetime < ${prevEnd}
                                ), 0)
                            )
                            ELSE GREATEST(0, (
                                COALESCE((
                                    SELECT SUM(a.amount)
                                    FROM envelop_allocations a
                                    WHERE a.envelop_id = e.id
                                      AND (a.account_id IS NULL OR a.account_id = ANY(${ownedParam}))
                                      AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= ${prevStart}::date
                                      AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < ${prevEnd}::date
                                ), 0)
                                -
                                COALESCE((
                                    SELECT SUM(t.amount)
                                    FROM transactions t
                                    WHERE t.envelop_id = e.id
                                      AND t.type = 'expense'
                                      AND t.source_account_id = ANY(${ownedParam})
                                      AND t.transaction_datetime >= ${prevStart}
                                      AND t.transaction_datetime < ${prevEnd}
                                ), 0)
                            ))
                        END::text AS carry_in,
                        -- Lifetime overrun on rolling envelopes — see
                        -- analytics/envelopeUtilization.mts for rationale.
                        -- LEDGER-REPLACEABLE: once the envelop_allocations
                        -- ledger gains first-class 'reckon' kinds, this
                        -- field can be derived (or retired) — see the
                        -- product plan saved in agent memory.
                        --
                        -- Scoping: every other column on this row is
                        -- owned-account-scoped via ownedParam. Mirror that
                        -- here so a personal viewer of a shared rolling
                        -- envelope doesn't see other members' spend
                        -- attributed to them. Space-wide allocations
                        -- (account_id IS NULL) belong to the personal
                        -- slice — same convention as the period allocated
                        -- subquery above.
                        CASE WHEN e.cadence = 'none' THEN
                            GREATEST(
                                0,
                                COALESCE((
                                    SELECT SUM(t.amount)
                                    FROM transactions t
                                    WHERE t.envelop_id = e.id
                                      AND t.type = 'expense'
                                      AND t.source_account_id = ANY(${ownedParam})
                                ), 0)
                                -
                                COALESCE((
                                    SELECT SUM(a.amount)
                                    FROM envelop_allocations a
                                    WHERE a.envelop_id = e.id
                                      AND (a.account_id IS NULL OR a.account_id = ANY(${ownedParam}))
                                ), 0)
                            )
                        ELSE 0 END::text AS lifetime_overrun
                    FROM envelops e
                    JOIN spaces s ON s.id = e.space_id
                    WHERE e.space_id = ANY(${memberSpaces})
                    ORDER BY s.name ASC, e.created_at ASC
                `;
                const totals = (await totalsQuery.execute(ctx.services.qb)).rows;

                const breakdownQuery = sql<{
                    envelop_id: string;
                    account_id: string | null;
                    allocated: string;
                    consumed: string;
                    prev_allocated: string;
                    prev_consumed: string;
                    cadence: string;
                    carry_over: boolean;
                    carry_policy: string;
                }>`
                    WITH alloc AS (
                        SELECT a.envelop_id,
                               a.account_id,
                               SUM(a.amount) AS amount
                        FROM envelop_allocations a
                        JOIN envelops e ON e.id = a.envelop_id
                        WHERE e.space_id = ANY(${memberSpaces})
                          AND (a.account_id IS NULL OR a.account_id = ANY(${ownedParam}))
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
                        WHERE t.space_id = ANY(${memberSpaces})
                          AND t.type = 'expense'
                          AND t.source_account_id = ANY(${ownedParam})
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
                        WHERE e.space_id = ANY(${memberSpaces})
                          AND e.cadence <> 'none'
                          AND e.carry_policy <> 'reset'
                          AND (a.account_id IS NULL OR a.account_id = ANY(${ownedParam}))
                          AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= ${prevStart}::date
                          AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < ${prevEnd}::date
                        GROUP BY a.envelop_id, a.account_id
                    ),
                    prev_spend AS (
                        SELECT t.envelop_id, t.source_account_id AS account_id, SUM(t.amount) AS amount
                        FROM transactions t
                        JOIN envelops e ON e.id = t.envelop_id
                        WHERE t.space_id = ANY(${memberSpaces})
                          AND e.cadence <> 'none'
                          AND e.carry_policy <> 'reset'
                          AND t.type = 'expense'
                          AND t.source_account_id = ANY(${ownedParam})
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
                        e.carry_over,
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
                const breakdown = (await breakdownQuery.execute(ctx.services.qb)).rows;

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
                    // Honor the three-mode carry policy: 'both' carries
                    // signed (debt persists), 'positive_only' clamps to
                    // ≥ 0, 'reset' / cadence='none' contribute nothing.
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
                    const pctSaved =
                        targetAmount != null && targetAmount > 0
                            ? Math.max(
                                  0,
                                  Math.min(100, (lifetimeFunded / targetAmount) * 100)
                              )
                            : null;
                    return {
                        envelopId: t.envelop_id,
                        spaceId: t.space_id,
                        spaceName: t.space_name,
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
                        pctComplete: pctSaved,
                        firstAllocatedAt: t.first_allocated_at,
                        lastAllocatedAt: t.last_allocated_at,
                        allocated,
                        consumed,
                        carryIn,
                        remaining,
                        borrowedIn: Number(t.borrowed_in),
                        borrowedOut: Number(t.borrowed_out),
                        lifetimeOverrun: Number(t.lifetime_overrun),
                        isDrift: remaining < 0,
                        breakdown: breakdownByEnvelope.get(t.envelop_id) ?? [],
                    };
                });
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute personal envelope utilization",
            });
        }
        return result;
    });
