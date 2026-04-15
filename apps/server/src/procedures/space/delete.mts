import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { TRPCError } from "@trpc/server";

export const deleteSpace = authorizedProcedure
    .input(z.object({ spaceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
        const [error] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const space = await trx
                    .selectFrom("spaces")
                    .select(["spaces.id"])
                    .where("spaces.id", "=", input.spaceId)
                    .executeTakeFirst();

                if (!space) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Space not found",
                    });
                }

                const membership = await trx
                    .selectFrom("space_members")
                    .select(["space_members.user_id", "role"])
                    .where("space_members.space_id", "=", input.spaceId)
                    .where("space_members.user_id", "=", ctx.auth.user.id)
                    .where("space_members.role", "in", ["owner"])
                    .executeTakeFirst();

                if (!membership) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "You are not a member of this space",
                    });
                }

                await trx
                    .deleteFrom("spaces")
                    .where("spaces.id", "=", input.spaceId)
                    .executeTakeFirst();
            })
        );
        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to delete space",
            });
        }
    });
