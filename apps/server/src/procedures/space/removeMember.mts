import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { TRPCError } from "@trpc/server";

export const removeMemberFromSpace = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            userIds: z.array(z.string().uuid()).min(1),
        })
    )
    .output(
        z.object({
            message: z.string(),
        })
    )
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
                    .select(["space_members.user_id"])
                    .where("space_members.space_id", "=", input.spaceId)
                    .where("space_members.user_id", "=", ctx.auth.user.id)
                    .where("space_members.role", "in", ["owner"])
                    .executeTakeFirst();

                if (!membership) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "Only owners can remove members",
                    });
                }

                const ownerCountResult = await trx
                    .selectFrom("space_members")
                    .select((eb) => eb.fn.count("space_members.user_id").as("count"))
                    .where("space_members.space_id", "=", input.spaceId)
                    .where("space_members.role", "in", ["owner"])
                    .executeTakeFirstOrThrow();

                const removingOwnerCountResult = await trx
                    .selectFrom("space_members")
                    .select((eb) => eb.fn.count("space_members.user_id").as("count"))
                    .where("space_members.space_id", "=", input.spaceId)
                    .where("space_members.role", "in", ["owner"])
                    .where("space_members.user_id", "in", input.userIds)
                    .executeTakeFirstOrThrow();

                const ownerCount = Number(ownerCountResult.count);
                const removingOwnerCount = Number(removingOwnerCountResult.count);

                if (removingOwnerCount > 0 && ownerCount - removingOwnerCount < 1) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Space must have at least one owner",
                    });
                }

                await trx
                    .deleteFrom("space_members")
                    .where("space_members.space_id", "=", input.spaceId)
                    .where("space_members.user_id", "in", input.userIds)
                    .execute();
            })
        );
        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to remove members from space",
            });
        }
        return { message: "Members removed successfully" };
    });
