import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import type { SpaceMembers } from "../../db/kysely/types.mjs";

type SpaceMemberRole = SpaceMembers["role"];

export const addMembersToSpace = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            members: z
                .array(
                    z.object({
                        userId: z.string().uuid(),
                        role: z.enum(["owner", "editor", "viewer"]),
                    })
                )
                .min(1),
        })
    )
    .output(
        z.object({
            spaceId: z.string().uuid(),
            addedCount: z.number(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
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
                    .select(["space_members.user_id", "space_members.role"])
                    .where("space_members.space_id", "=", input.spaceId)
                    .where("space_members.user_id", "=", ctx.auth.user.id)
                    .where("space_members.role", "in", ["owner", "editor"])
                    .executeTakeFirst();

                if (!membership) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "You are not a member of this space",
                    });
                }

                const requesterIsOwner =
                    membership.role === ("owner" as unknown as SpaceMemberRole);

                if (input.members.some((member) => member.role === "owner") && !requesterIsOwner) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "Only owners can add owners to a space",
                    });
                }

                const insertValues = input.members.map((member) => ({
                    space_id: input.spaceId,
                    user_id: member.userId,
                    role: member.role as unknown as SpaceMemberRole,
                }));

                const insertedMembers = await trx
                    .insertInto("space_members")
                    .values(insertValues)
                    .onConflict((oc) => oc.columns(["space_id", "user_id"]).doNothing())
                    .returning(["space_members.user_id"])
                    .execute();

                return {
                    spaceId: input.spaceId,
                    addedCount: insertedMembers.length,
                };
            })
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to add members",
            });
        }

        return result;
    });
