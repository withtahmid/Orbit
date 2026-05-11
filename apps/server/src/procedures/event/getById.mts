import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/* Single-row fetch for deep-links into the event detail page. Avoids
   depending on `event.listBySpace` cache, and returns a clean 404
   when the id doesn't exist. */
export const getEventById = authorizedProcedure
    .input(
        z.object({
            eventId: z.string().uuid(),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            (async () => {
                const event = await ctx.services.qb
                    .selectFrom("events")
                    .select([
                        "id",
                        "space_id",
                        "name",
                        "start_time",
                        "end_time",
                        "color",
                        "icon",
                        "description",
                        "estimated_amount",
                        "status",
                        "closed_at",
                        "created_at",
                    ])
                    .where("events.id", "=", input.eventId)
                    .executeTakeFirst();

                if (!event) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Event not found",
                    });
                }

                await resolveSpaceMembership({
                    trx: ctx.services.qb,
                    spaceId: event.space_id,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor", "viewer"] as unknown as SpaceMembers["role"][],
                });

                return event;
            })()
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to fetch event",
            });
        }

        return result;
    });
