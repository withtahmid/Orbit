import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { resolveSpaceUnallocated } from "../allocation/utils/resolveSpaceUnallocated.mjs";

/**
 * Trend + breakdown of the space-wide Unbudgeted pool over the trailing
 * `windowDays` (default 90). Surfaces *why* the pool moved — especially
 * the "silent absorbed overspend" component that the envelope-level UI
 * never makes visible on its own.
 *
 * The breakdown is computed from raw event data over the window:
 *   - income:        sum of `income` transactions hitting space accounts
 *                    (assets credited, liabilities debited).
 *   - allocations:   net positive envelope_allocations + plan_allocations
 *                    created in the window. Positive amounts increase
 *                    "held"; negative amounts (deallocations) decrease it.
 *   - absorbedOverspend: the conceptual leak. For each completed past
 *                    period that fell within the window, if an envelope
 *                    finished overspent (consumed > allocated + carryIn)
 *                    AND its carry policy didn't make the debt persist
 *                    (i.e. policy != 'both'), the overage is the silent
 *                    absorption. Sum across envelopes.
 *
 * The numbers don't have to reconcile to the exact unbudgeted delta —
 * account adjustments and transfers don't fit cleanly into one bucket —
 * but they answer the user's first question ("what's draining my buffer?")
 * with the components that matter.
 */
export const unbudgetedTrend = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            windowDays: z.number().int().min(1).max(730).default(90),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: [
                        "owner",
                        "editor",
                        "viewer",
                    ] as unknown as SpaceMembers["role"][],
                });

                const now = new Date();
                const windowStart = new Date(
                    now.getTime() - input.windowDays * 86_400_000
                );

                const current = await resolveSpaceUnallocated({
                    trx,
                    spaceId: input.spaceId,
                });

                const income = await sql<{ total: string }>`
                    SELECT COALESCE(SUM(t.amount), 0)::text AS total
                    FROM transactions t
                    WHERE t.space_id = ${input.spaceId}
                      AND t.type = 'income'
                      AND t.transaction_datetime >= ${windowStart}
                      AND t.transaction_datetime < ${now}
                `
                    .execute(trx)
                    .then((r) => Number(r.rows[0]?.total ?? 0));

                const allocChange = await sql<{ total: string }>`
                    SELECT COALESCE(SUM(a.amount), 0)::text AS total
                    FROM envelop_allocations a
                    JOIN envelops e ON e.id = a.envelop_id
                    WHERE e.space_id = ${input.spaceId}
                      AND a.created_at >= ${windowStart}
                      AND a.created_at < ${now}
                `
                    .execute(trx)
                    .then((r) => Number(r.rows[0]?.total ?? 0));

                const planAllocChange = await sql<{ total: string }>`
                    SELECT COALESCE(SUM(a.amount), 0)::text AS total
                    FROM plan_allocations a
                    JOIN plans p ON p.id = a.plan_id
                    WHERE p.space_id = ${input.spaceId}
                      AND a.created_at >= ${windowStart}
                      AND a.created_at < ${now}
                `
                    .execute(trx)
                    .then((r) => Number(r.rows[0]?.total ?? 0));

                // Absorbed overspend: per past month within the window,
                // for each envelope whose carry_policy != 'both', sum the
                // amount by which consumed exceeded (allocated + carryIn
                // for that period). We approximate carryIn as 0 for
                // simplicity (the small inaccuracy biases the number
                // slightly conservative — i.e. we may *under-report* the
                // drain rather than over-report).
                const absorbed = await sql<{ total: string }>`
                    WITH months AS (
                        SELECT generate_series(
                            DATE_TRUNC('month', ${windowStart}::timestamp),
                            DATE_TRUNC('month', ${now}::timestamp) - INTERVAL '1 day',
                            INTERVAL '1 month'
                        ) AS m_start
                    ),
                    per_env AS (
                        SELECT
                            e.id AS envelop_id,
                            e.carry_policy,
                            m.m_start,
                            (m.m_start + INTERVAL '1 month')::timestamp AS m_end,
                            COALESCE((
                                SELECT SUM(a.amount)
                                FROM envelop_allocations a
                                WHERE a.envelop_id = e.id
                                  AND COALESCE(
                                        a.period_start,
                                        DATE_TRUNC('month', a.created_at)::date
                                      ) = m.m_start::date
                            ), 0) AS allocated,
                            COALESCE((
                                SELECT SUM(t.amount)
                                FROM transactions t
                                JOIN expense_categories ec ON ec.id = t.expense_category_id
                                WHERE ec.envelop_id = e.id
                                  AND t.type = 'expense'
                                  AND t.transaction_datetime >= m.m_start
                                  AND t.transaction_datetime < (m.m_start + INTERVAL '1 month')
                            ), 0) AS consumed
                        FROM envelops e
                        CROSS JOIN months m
                        WHERE e.space_id = ${input.spaceId}
                          AND e.cadence = 'monthly'
                          AND e.carry_policy <> 'both'
                          -- Only completed months: end strictly before now.
                          AND (m.m_start + INTERVAL '1 month') <= ${now}
                    )
                    SELECT COALESCE(SUM(GREATEST(0, consumed - allocated)), 0)::text AS total
                    FROM per_env
                `
                    .execute(trx)
                    .then((r) => Number(r.rows[0]?.total ?? 0));

                return {
                    current,
                    windowDays: input.windowDays,
                    income,
                    allocationsNet: allocChange,
                    planAllocationsNet: planAllocChange,
                    absorbedOverspend: absorbed,
                };
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute unbudgeted trend",
            });
        }
        return result;
    });
