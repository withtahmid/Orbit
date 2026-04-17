import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

const HEX = /^#[0-9a-fA-F]{6}$/;

export const updateEvent = authorizedProcedure
    .input(
        z
            .object({
                eventId: z.string().uuid(),
                name: z.string().min(1).max(255).optional(),
                startTime: z.coerce.date().optional(),
                endTime: z.coerce.date().optional(),
                color: z.string().regex(HEX).optional(),
                icon: z.string().min(1).max(48).optional(),
                description: z.string().max(2000).nullable().optional(),
            })
            .refine(
                (data) =>
                    data.name !== undefined ||
                    data.startTime !== undefined ||
                    data.endTime !== undefined ||
                    data.color !== undefined ||
                    data.icon !== undefined ||
                    data.description !== undefined,
                { message: "At least one field must be provided" }
            )
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
                        color: input.color,
                        icon: input.icon,
                        description: input.description,
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
                message: error.message || "Failed to update event",
            });
        }

        return result;
    });
