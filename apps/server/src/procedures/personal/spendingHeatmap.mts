import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

/**
 * Daily expense totals across every space the caller is a member of,
 * restricted to expenses paid out of accounts they personally own —
 * the dataset for the personal view's calendar heatmap.
 */
export const personalSpendingHeatmap = authorizedProcedure
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
                if (owned.length === 0 || memberSpaces.length === 0) return [];

                const query = sql<{ day: Date; total: string }>`
                    SELECT day, SUM(amount)::text AS total FROM (
                        SELECT date_trunc('day', transaction_datetime) AS day, amount
                        FROM transactions
                        WHERE space_id = ANY(${memberSpaces})
                          AND type = 'expense'
                          AND source_account_id = ANY(${owned})
                          AND transaction_datetime >= ${input.periodStart}
                          AND transaction_datetime < ${input.periodEnd}
                        UNION ALL
                        -- Transfer fees out of owned accounts show up
                        -- on the personal heatmap the day they happen.
                        SELECT date_trunc('day', transaction_datetime) AS day, fee_amount AS amount
                        FROM transactions
                        WHERE space_id = ANY(${memberSpaces})
                          AND type = 'transfer'
                          AND fee_amount IS NOT NULL
                          AND source_account_id = ANY(${owned})
                          AND transaction_datetime >= ${input.periodStart}
                          AND transaction_datetime < ${input.periodEnd}
                    ) entries
                    GROUP BY day
                    ORDER BY day ASC
                `;
                const res = await query.execute(ctx.services.qb);
                return res.rows.map((r) => ({
                    day: new Date(r.day),
                    total: Number(r.total),
                }));
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute personal spending heatmap",
            });
        }
        return result;
    });
