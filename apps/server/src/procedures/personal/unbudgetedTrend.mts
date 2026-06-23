import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

/**
 * Cross-space drain-of-unbudgeted breakdown over the trailing windowDays.
 *
 * Income and absorbed-overspend are user-slice (only transactions on the
 * caller's owned accounts) so the personal trend doesn't fold a co-
 * member's cash flow into "my" drain on shared spaces.
 */
export const personalUnbudgetedTrend = authorizedProcedure
    .input(
        z.object({
            windowDays: z.number().int().min(1).max(730).default(90),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const memberSpaces = await resolveMemberSpaceIds(
                    trx,
                    ctx.auth.user.id
                );
                if (memberSpaces.length === 0) {
                    return {
                        windowDays: input.windowDays,
                        income: 0,
                        absorbedOverspend: 0,
                    };
                }

                const owned = await resolveOwnedAccountIds(
                    trx,
                    ctx.auth.user.id
                );
                const ownedParam =
                    owned.length === 0
                        ? ["00000000-0000-0000-0000-000000000000"]
                        : owned;

                const now = new Date();
                const windowStart = new Date(
                    now.getTime() - input.windowDays * 86_400_000
                );

                const income = await sql<{ total: string }>`
                    SELECT COALESCE(SUM(t.amount), 0)::text AS total
                    FROM transactions t
                    WHERE t.space_id = ANY(${memberSpaces}::uuid[])
                      AND t.type = 'income'
                      AND t.destination_account_id = ANY(${ownedParam}::uuid[])
                      AND t.transaction_datetime >= ${windowStart}
                      AND t.transaction_datetime < ${now}
                `
                    .execute(trx)
                    .then((r) => Number(r.rows[0]?.total ?? 0));

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
                                  AND t.source_account_id = ANY(${ownedParam}::uuid[])
                                  AND t.transaction_datetime >= m.m_start
                                  AND t.transaction_datetime < (m.m_start + INTERVAL '1 month')
                            ), 0) AS consumed
                        FROM envelops e
                        CROSS JOIN months m
                        WHERE e.space_id = ANY(${memberSpaces}::uuid[])
                          AND e.cadence = 'monthly'
                          -- Only months fully inside the window (start on/after
                          -- windowStart) so a partial leading month's
                          -- pre-window spend isn't counted.
                          AND m.m_start >= ${windowStart}
                          AND (m.m_start + INTERVAL '1 month') <= ${now}
                    )
                    SELECT COALESCE(SUM(GREATEST(0, consumed - allocated)), 0)::text AS total
                    FROM per_env
                `
                    .execute(trx)
                    .then((r) => Number(r.rows[0]?.total ?? 0));

                return {
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
                message:
                    error.message || "Failed to compute personal unbudgeted trend",
            });
        }
        return result;
    });
