import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const createEvent = authorizedProcedure
    .input(
        z
            .object({
                spaceId: z.string().uuid(),
                name: z.string().min(1).max(255),
                startTime: z.coerce.date(),
                endTime: z.coerce.date(),
            })
            .refine((data) => data.endTime > data.startTime, {
                message: "endTime must be after startTime",
                path: ["endTime"],
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
                    })
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
                message: error.message || "Failed to create event",
            });
        }

        return result;
    });
