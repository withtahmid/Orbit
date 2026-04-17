import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { TRPCError } from "@trpc/server";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "./utils/resolveSpaceMembership.mjs";
import type { SpaceMembers } from "../../db/kysely/types.mjs";

export const updateSpace = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            name: z.string().min(1).max(255).optional(),
        })
    )
    .output(
        z.object({
            id: z.string().uuid(),
            name: z.string(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        await resolveSpaceMembership({
            trx: ctx.services.qb,
            spaceId: input.spaceId,
            userId: ctx.auth.user.id,
            roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
        });

        const [error, result] = await safeAwait(
            ctx.services.qb
                .updateTable("spaces")
                .set({
                    name: input.name,
                    updated_by: ctx.auth.user.id,
                })
                .returning(["id", "name"])
                .where("id", "=", input.spaceId)
                .executeTakeFirstOrThrow()
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to update space",
            });
        }

        return result;
    });
