import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

export const personalAnomaliesShapeStats = authorizedProcedure
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
                const empty = {
                    medianDay: 0,
                    p95Day: 0,
                    mean: 0,
                    stddev: 0,
                    totalDays: 0,
                    frugalDays: 0,
                    heavyDays: 0,
                };
                if (owned.length === 0 || memberSpaces.length === 0) return empty;

                const row = await sql<{
                    median_day: string;
                    p95_day: string;
                    mean: string;
                    stddev: string;
                    total_days: string;
                    frugal_days: string;
                    heavy_days: string;
                }>`
                    WITH days AS (
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
                                        AND t.source_account_id = ANY(${owned}) THEN t.amount
                                    ELSE 0
                                END
                                + CASE
                                    WHEN t.type = 'transfer'
                                        AND t.source_account_id = ANY(${owned})
                                        AND t.fee_amount IS NOT NULL THEN t.fee_amount
                                    ELSE 0
                                END
                            ) AS expense
                        FROM transactions t
                        WHERE t.space_id = ANY(${memberSpaces})
                          AND t.transaction_datetime >= ${input.periodStart}
                          AND t.transaction_datetime < ${input.periodEnd}
                          AND t.source_account_id = ANY(${owned})
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
                `.execute(ctx.services.qb);

                const r = row.rows[0];
                if (!r) return empty;
                return {
                    medianDay: Number(r.median_day),
                    p95Day: Number(r.p95_day),
                    mean: Number(r.mean),
                    stddev: Number(r.stddev),
                    totalDays: Number(r.total_days),
                    frugalDays: Number(r.frugal_days),
                    heavyDays: Number(r.heavy_days),
                };
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message ||
                    "Failed to compute personal shape stats",
            });
        }
        return result;
    });
