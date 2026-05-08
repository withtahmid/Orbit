import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const spendingHeatmap = authorizedProcedure
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

                // Daily spending = anything that reduced the space's
                // cash position: expenses whose source is in scope,
                // cross-space outbound transfers (source in, dest out)
                // as principal, and transfer fees whose source is in
                // scope. Mirrors cashFlow.mts / spaceSummary.mts so a
                // day's heatmap cell and that day's cash-flow expense
                // bar always agree.
                const query = sql<{ day: Date; total: string }>`
                    WITH scope_accounts AS (
                        SELECT sa.account_id
                        FROM space_accounts sa
                        WHERE sa.space_id = ${input.spaceId}
                    )
                    SELECT day, SUM(amount)::text AS total FROM (
                        SELECT date_trunc('day', transaction_datetime) AS day, amount
                        FROM transactions
                        WHERE type = 'expense'
                          AND source_account_id IN (SELECT account_id FROM scope_accounts)
                          AND transaction_datetime >= ${input.periodStart}
                          AND transaction_datetime < ${input.periodEnd}
                        UNION ALL
                        SELECT date_trunc('day', transaction_datetime) AS day, amount
                        FROM transactions
                        WHERE type = 'transfer'
                          AND source_account_id IN (SELECT account_id FROM scope_accounts)
                          AND destination_account_id NOT IN (SELECT account_id FROM scope_accounts)
                          AND transaction_datetime >= ${input.periodStart}
                          AND transaction_datetime < ${input.periodEnd}
                        UNION ALL
                        SELECT date_trunc('day', transaction_datetime) AS day, fee_amount AS amount
                        FROM transactions
                        WHERE type = 'transfer'
                          AND fee_amount IS NOT NULL
                          AND source_account_id IN (SELECT account_id FROM scope_accounts)
                          AND transaction_datetime >= ${input.periodStart}
                          AND transaction_datetime < ${input.periodEnd}
                    ) entries
                    GROUP BY day
                    ORDER BY day ASC
                `;
                const res = await query.execute(trx);
                return res.rows.map((r) => ({
                    day: new Date(r.day),
                    total: Number(r.total),
                }));
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute spending heatmap",
            });
        }
        return result;
    });
