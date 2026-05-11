import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/* Sum of expense transactions on a single event, grouped by leaf
   category. Powers the "Spending by category" section on the event
   detail page. Distinct from analytics.categoryBreakdown, which is
   period-based, not event-based. */
export const eventCategoryBreakdown = authorizedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const event = await trx
                    .selectFrom("events")
                    .select(["id", "space_id"])
                    .where("events.id", "=", input.eventId)
                    .executeTakeFirst();

                if (!event) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Event not found",
                    });
                }

                await resolveSpaceMembership({
                    trx,
                    spaceId: event.space_id,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor", "viewer"] as unknown as SpaceMembers["role"][],
                });

                const res = await sql<{
                    category_id: string;
                    category_name: string;
                    color: string;
                    icon: string;
                    total: string;
                    tx_count: string;
                }>`
                    SELECT
                        ec.id::text   AS category_id,
                        ec.name       AS category_name,
                        ec.color,
                        ec.icon,
                        COALESCE(SUM(t.amount), 0)::text AS total,
                        COUNT(t.id)::text AS tx_count
                    FROM transactions t
                    JOIN expense_categories ec ON ec.id = t.expense_category_id
                    WHERE t.event_id = ${input.eventId}
                      AND t.type     = 'expense'
                    GROUP BY ec.id, ec.name, ec.color, ec.icon
                    ORDER BY SUM(t.amount) DESC NULLS LAST
                `.execute(trx);

                return res.rows.map((r) => ({
                    categoryId: r.category_id,
                    categoryName: r.category_name,
                    color: r.color,
                    icon: r.icon,
                    total: Number(r.total),
                    txCount: Number(r.tx_count),
                }));
            })
        );

        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute event category breakdown",
            });
        }
        return result;
    });
