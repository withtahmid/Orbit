import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

export const personalAnomaliesStreaks = authorizedProcedure
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
                    return [
                        {
                            kind: "no-spend-day" as const,
                            label: "No-spend days",
                            current: 0,
                            best: 0,
                            totalDays: 0,
                        },
                    ];
                }

                const rows = await sql<{ d: Date; expense: string }>`
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
                            ) AS expense
                        FROM transactions t
                        WHERE t.space_id = ANY(${memberSpaces})
                          AND t.transaction_datetime >= ${input.periodStart}
                          AND t.transaction_datetime < ${input.periodEnd}
                          AND t.source_account_id = ANY(${owned})
                        GROUP BY 1
                    )
                    SELECT
                        days.d::timestamptz AS d,
                        COALESCE(s.expense, 0)::text AS expense
                    FROM days
                    LEFT JOIN spend s ON s.d = days.d
                    ORDER BY days.d ASC
                `.execute(ctx.services.qb);

                const series = rows.rows.map((r) => ({
                    d: new Date(r.d),
                    expense: Number(r.expense),
                }));

                let best = 0;
                let run = 0;
                let current = 0;
                for (const row of series) {
                    if (row.expense === 0) {
                        run += 1;
                        if (run > best) best = run;
                    } else {
                        run = 0;
                    }
                }
                for (let i = series.length - 1; i >= 0; i--) {
                    if (series[i].expense === 0) current += 1;
                    else break;
                }

                return [
                    {
                        kind: "no-spend-day" as const,
                        label: "No-spend days",
                        current,
                        best,
                        totalDays: series.length,
                    },
                ];
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message ||
                    "Failed to compute personal streaks",
            });
        }
        return result;
    });
