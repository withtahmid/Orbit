import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const setEventStatus = authorizedProcedure
    .input(
        z.object({
            eventId: z.string().uuid(),
            status: z.enum(["active", "closed"]),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const current = await trx
                    .selectFrom("events")
                    .select(["id", "space_id", "status"])
                    .where("events.id", "=", input.eventId)
                    .executeTakeFirst();

                if (!current) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Event not found",
                    });
                }

                await resolveSpaceMembership({
                    trx,
                    spaceId: current.space_id,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                });

                /* No-op when status is unchanged so a redundant "Close"
                   click doesn't rewrite closed_at to NOW() and move the
                   "Closed Mar 14" subtitle to today. */
                if (current.status === input.status) {
                    return trx
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
                        .executeTakeFirstOrThrow();
                }

                const event = await trx
                    .updateTable("events")
                    .set({
                        status: input.status,
                        closed_at: input.status === "closed" ? sql`NOW()` : null,
                    })
                    .where("events.id", "=", input.eventId)
                    .returning([
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
                    .executeTakeFirstOrThrow();

                return event;
            })
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to update event status",
            });
        }

        return result;
    });
