import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Distribution stats for per-day expense in the window — the top KPI
 * strip on AnomaliesView wants to call out median day, P95 day, frugal
 * vs heavy day count. Frugal = day total ≤ 50% of median. Heavy = day
 * total ≥ P95. Both thresholds are loose by design — these are quick
 * "vibes" KPIs, not statistical claims.
 */
export const anomaliesShapeStats = authorizedProcedure
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

                const row = await sql<{
                    median_day: string;
                    p95_day: string;
                    mean: string;
                    stddev: string;
                    total_days: string;
                    frugal_days: string;
                    heavy_days: string;
                }>`
                    WITH scope_accounts AS (
                        SELECT account_id
                        FROM space_accounts
                        WHERE space_id = ${input.spaceId}
                    ),
                    days AS (
                        SELECT generate_series(
                            ${input.periodStart}::timestamptz,
                            ${input.periodEnd}::timestamptz - INTERVAL '1 day',
                            INTERVAL '1 day'
                        )::date AS d
                    ),
                    spend AS (
                        SELECT
                            date_trunc('day', t.transaction_datetime)::date AS d,
                            SUM(
                                CASE
                                    WHEN t.type = 'expense'
                                        AND t.source_account_id IN (SELECT account_id FROM scope_accounts) THEN t.amount
                                    ELSE 0
                                END
                            ) AS expense
                        FROM transactions t
                        WHERE t.transaction_datetime >= ${input.periodStart}
                          AND t.transaction_datetime < ${input.periodEnd}
                          AND t.source_account_id IN (SELECT account_id FROM scope_accounts)
                        GROUP BY 1
                    ),
                    daily AS (
                        SELECT days.d, COALESCE(s.expense, 0)::numeric AS expense
                        FROM days
                        LEFT JOIN spend s ON s.d = days.d
                    ),
                    stats AS (
                        SELECT
                            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY expense) AS median_day,
                            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY expense) AS p95_day,
                            AVG(expense) AS mean,
                            COALESCE(STDDEV_SAMP(expense), 0) AS stddev,
                            COUNT(*) AS total_days
                        FROM daily
                    )
                    SELECT
                        stats.median_day::text,
                        stats.p95_day::text,
                        stats.mean::text,
                        stats.stddev::text,
                        stats.total_days::text,
                        SUM(CASE WHEN d.expense <= GREATEST(stats.median_day * 0.5, 0) THEN 1 ELSE 0 END)::text AS frugal_days,
                        SUM(CASE WHEN d.expense >= stats.p95_day THEN 1 ELSE 0 END)::text AS heavy_days
                    FROM daily d, stats
                    GROUP BY stats.median_day, stats.p95_day, stats.mean, stats.stddev, stats.total_days
                `.execute(trx);

                const r = row.rows[0];
                if (!r) {
                    return {
                        medianDay: 0,
                        p95Day: 0,
                        mean: 0,
                        stddev: 0,
                        totalDays: 0,
                        frugalDays: 0,
                        heavyDays: 0,
                    };
                }
                return {
                    medianDay: Number(r.median_day),
                    p95Day: Number(r.p95_day),
                    mean: Number(r.mean),
                    stddev: Number(r.stddev),
                    totalDays: Number(r.total_days),
                    frugalDays: Number(r.frugal_days),
                    heavyDays: Number(r.heavy_days),
                };
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message || "Failed to compute spending shape stats",
            });
        }
        return result;
    });
