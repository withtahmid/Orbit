import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { attachFilesToEvent } from "../file/attach.mjs";

const HEX = /^#[0-9a-fA-F]{6}$/;

export const createEvent = authorizedProcedure
    .input(
        z
            .object({
                spaceId: z.string().uuid(),
                name: z.string().min(1).max(255),
                startTime: z.coerce.date(),
                endTime: z.coerce.date(),
                color: z.string().regex(HEX).optional(),
                icon: z.string().min(1).max(48).optional(),
                description: z.string().max(2000).optional(),
                attachmentFileIds: z.array(z.string().uuid()).max(10).optional(),
            })
            .refine((data) => data.endTime > data.startTime, {
                message: "endTime must be after startTime",
                path: ["endTime"],
            })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                });

                const event = await trx
                    .insertInto("events")
                    .values({
                        space_id: input.spaceId,
                        name: input.name,
                        start_time: input.startTime,
                        end_time: input.endTime,
                        color: input.color,
                        icon: input.icon,
                        description: input.description ?? null,
                    })
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

                await attachFilesToEvent({
                    trx,
                    eventId: event.id,
                    fileIds: input.attachmentFileIds ?? [],
                    userId: ctx.auth.user.id,
                });

                return event;
            })
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to create event",
            });
        }

        return result;
    });
