import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const listEventsBySpace = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
        })
    )
    .output(
        z.array(
            z.object({
                id: z.string().uuid(),
                space_id: z.string().uuid(),
                name: z.string(),
                start_time: z.date(),
                end_time: z.date(),
                created_at: z.date(),
            })
        )
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

                return trx
                    .selectFrom("events")
                    .select(["id", "space_id", "name", "start_time", "end_time", "created_at"])
                    .where("events.space_id", "=", input.spaceId)
                    .orderBy("events.start_time", "asc")
                    .execute();
            })
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to fetch events",
            });
        }

        return result;
    });
