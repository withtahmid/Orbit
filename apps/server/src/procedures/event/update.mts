import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const updateEvent = authorizedProcedure
    .input(
        z
            .object({
                eventId: z.string().uuid(),
                name: z.string().min(1).max(255).optional(),
                startTime: z.coerce.date().optional(),
                endTime: z.coerce.date().optional(),
            })
            .refine((data) => data.name || data.startTime || data.endTime, {
                message: "At least one field must be provided",
            })
    )
    .output(
        z.object({
            id: z.string().uuid(),
            space_id: z.string().uuid(),
            name: z.string(),
            start_time: z.date(),
            end_time: z.date(),
            created_at: z.date(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const current = await trx
                    .selectFrom("events")
                    .select(["id", "space_id", "start_time", "end_time"])
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

                const nextStart = input.startTime ?? current.start_time;
                const nextEnd = input.endTime ?? current.end_time;

                if (nextEnd <= nextStart) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "endTime must be after startTime",
                    });
                }

                const event = await trx
                    .updateTable("events")
                    .set({
                        name: input.name,
                        start_time: input.startTime,
                        end_time: input.endTime,
                    })
                    .where("events.id", "=", input.eventId)
                    .returning(["id", "space_id", "name", "start_time", "end_time", "created_at"])
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
                message: error.message || "Failed to update event",
            });
        }

        return result;
    });
