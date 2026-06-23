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
 *   - income:        sum of `income` transactions into accounts shared
 *                    into this space (scoped by destination account).
 *   - absorbedOverspend: the conceptual leak. Monthly envelopes reset
 *                    each period, so for every completed past month that
 *                    fell within the window, any amount by which an
 *                    envelope's spend exceeded that month's allocation
 *                    (consumed > allocated) is silently absorbed by the
 *                    unbudgeted pool. Summed across envelopes.
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

                // Income hitting accounts shared into this space (scoped by
                // destination, matching analytics.spaceSummary — `space_id`
                // is a categorization tag, not a scope boundary).
                const income = await sql<{ total: string }>`
                    SELECT COALESCE(SUM(t.amount), 0)::text AS total
                    FROM transactions t
                    WHERE t.type = 'income'
                      AND t.destination_account_id IN (
                          SELECT account_id FROM space_accounts
                          WHERE space_id = ${input.spaceId}
                      )
                      AND t.transaction_datetime >= ${windowStart}
                      AND t.transaction_datetime < ${now}
                `
                    .execute(trx)
                    .then((r) => Number(r.rows[0]?.total ?? 0));

                // Absorbed overspend: per past month within the window, for
                // each monthly envelope, sum the amount by which consumed
                // exceeded that month's allocation. Monthly envelopes reset
                // every period (no carry-over), so a completed month's
                // overspend is silently absorbed by the unbudgeted pool —
                // exactly the drain this surfaces.
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
                            m.m_start,
                            (m.m_start + INTERVAL '1 month')::timestamp AS m_end,
                            COALESCE((
                                SELECT a.amount
                                FROM envelop_allocations a
                                WHERE a.envelop_id = e.id
                                  AND a.period_start = m.m_start::date
                            ), 0) AS allocated,
                            COALESCE((
                                SELECT SUM(t.amount)
                                FROM transactions t
                                WHERE t.envelop_id = e.id
                                  AND t.type = 'expense'
                                  AND t.transaction_datetime >= m.m_start
                                  AND t.transaction_datetime < (m.m_start + INTERVAL '1 month')
                            ), 0) AS consumed
                        FROM envelops e
                        CROSS JOIN months m
                        WHERE e.space_id = ${input.spaceId}
                          AND e.cadence = 'monthly'
                          -- Only months fully inside the window: start on/after
                          -- windowStart (so we don't count a partial leading
                          -- month's pre-window spend) and end before now.
                          AND m.m_start >= ${windowStart}
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
