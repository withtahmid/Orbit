import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const createPlan = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            name: z.string().min(1).max(255),
        })
    )
    .output(
        z.object({
            id: z.string().uuid(),
            space_id: z.string().uuid(),
            name: z.string(),
            created_at: z.date(),
            updated_at: z.date().nullable(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as SpaceMembers["role"][],
                });

                return trx
                    .insertInto("plans")
                    .values({
                        space_id: input.spaceId,
                        name: input.name,
                    })
                    .returning(["id", "space_id", "name", "created_at", "updated_at"])
                    .executeTakeFirstOrThrow();
            })
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to create plan",
            });
        }

        return result;
    });
