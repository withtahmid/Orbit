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

                const query = sql<{ day: Date; total: string }>`
                    SELECT
                        date_trunc('day', transaction_datetime) AS day,
                        SUM(amount)::text AS total
                    FROM transactions
                    WHERE space_id = ${input.spaceId}
                      AND type = 'expense'
                      AND transaction_datetime >= ${input.periodStart}
                      AND transaction_datetime < ${input.periodEnd}
                    GROUP BY 1
                    ORDER BY 1 ASC
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
