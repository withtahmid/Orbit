import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Spending streaks for the AnomaliesView. Today: only "no-spend day"
 * streaks are computed — consecutive days with no expense out of any
 * scoped account. The shape is intentionally extensible (a `kind`
 * discriminator) so habit streaks, over-budget streaks, etc., can be
 * added in follow-up iterations without re-shaping the consumer.
 *
 * "Current" = the streak that ends at the period's last day; 0 if the
 * last day has spending. "Best" = longest run anywhere in the window.
 */
export const anomaliesStreaks = authorizedProcedure
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

                const rows = await sql<{ d: Date; expense: string }>`
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
                    )
                    SELECT
                        days.d::timestamptz AS d,
                        COALESCE(s.expense, 0)::text AS expense
                    FROM days
                    LEFT JOIN spend s ON s.d = days.d
                    ORDER BY days.d ASC
                `.execute(trx);

                const series = rows.rows.map((r) => ({
                    d: new Date(r.d),
                    expense: Number(r.expense),
                }));

                let best = 0;
                let run = 0;
                let current = 0;
                for (let i = 0; i < series.length; i++) {
                    if (series[i].expense === 0) {
                        run += 1;
                        if (run > best) best = run;
                    } else {
                        run = 0;
                    }
                }
                /* Walk from the right to find the trailing-zero run. */
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
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute streaks",
            });
        }
        return result;
    });
