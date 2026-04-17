import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { resolveSpaceMembership } from "./utils/resolveSpaceMembership.mjs";

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
                const { membership } = await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                });

                const requesterIsOwner =
                    membership.role === ("owner" as unknown as SpaceMembers["role"]);

                if (input.members.some((member) => member.role === "owner") && !requesterIsOwner) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "Only owners can add owners to a space",
                    });
                }

                const insertValues = input.members.map((member) => ({
                    space_id: input.spaceId,
                    user_id: member.userId,
                    role: member.role as unknown as SpaceMembers["role"],
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
