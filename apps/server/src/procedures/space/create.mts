import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { TRPCError } from "@trpc/server";
import type { SpaceMembers } from "../../db/kysely/types.mjs";

export const createSpace = authorizedProcedure
    .input(
        z.object({
            name: z.string().min(1).max(100),
        })
    )
    .output(
        z.object({
            id: z.string().uuid(),
            name: z.string(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const space = await trx
                    .insertInto("spaces")
                    .values({
                        name: input.name,
                        created_by: ctx.auth.user.id,
                        updated_by: ctx.auth.user.id,
                    })
                    .returning(["id", "name"])
                    .executeTakeFirstOrThrow();

                await trx
                    .insertInto("space_members")
                    .values({
                        space_id: space.id,
                        user_id: ctx.auth.user.id,
                        role: "owner" as unknown as SpaceMembers["role"],
                    })
                    .executeTakeFirstOrThrow();
                return space;
            })
        );
        if (error) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to create space",
            });
        }
        return result;
    });
