import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const envelopeUtilization = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            periodStart: z.coerce.date().optional(),
            periodEnd: z.coerce.date().optional(),
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

                const periodStart = input.periodStart ?? new Date("1970-01-01");
                const periodEnd = input.periodEnd ?? new Date("9999-12-31");

                const query = sql<{
                    envelop_id: string;
                    name: string;
                    color: string;
                    icon: string;
                    description: string | null;
                    allocated: string;
                    consumed: string;
                    remaining: string;
                    period_consumed: string;
                }>`
                    SELECT
                        e.id::text AS envelop_id,
                        e.name,
                        e.color,
                        e.icon,
                        e.description,
                        COALESCE(eb.allocated, 0)::text AS allocated,
                        COALESCE(eb.consumed, 0)::text AS consumed,
                        COALESCE(eb.remaining, 0)::text AS remaining,
                        COALESCE((
                            SELECT SUM(t.amount)
                            FROM transactions t
                            JOIN expense_categories ec ON ec.id = t.expense_category_id
                            WHERE ec.envelop_id = e.id
                              AND t.type = 'expense'
                              AND t.transaction_datetime >= ${periodStart}
                              AND t.transaction_datetime < ${periodEnd}
                        ), 0)::text AS period_consumed
                    FROM envelops e
                    LEFT JOIN envelop_balances eb ON eb.envelop_id = e.id
                    WHERE e.space_id = ${input.spaceId}
                    ORDER BY e.created_at ASC
                `;
                const res = await query.execute(trx);
                return res.rows.map((r) => ({
                    envelopId: r.envelop_id,
                    name: r.name,
                    color: r.color,
                    icon: r.icon,
                    description: r.description,
                    allocated: Number(r.allocated),
                    consumed: Number(r.consumed),
                    remaining: Number(r.remaining),
                    periodConsumed: Number(r.period_consumed),
                }));
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute envelope utilization",
            });
        }
        return result;
    });
