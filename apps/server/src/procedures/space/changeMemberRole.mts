import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { TRPCError } from "@trpc/server";
import { SpaceMembers } from "../../db/kysely/types.mjs";
import { resolveSpaceMembership } from "./utils/resolveSpaceMembership.mjs";

export const changeMemberRoleInSpace = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            userId: z.string().uuid(),
            role: z.enum(["owner", "editor", "viewer"]),
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
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as SpaceMembers["role"][],
                });

                const targetMembership = await trx
                    .selectFrom("space_members")
                    .select(["space_members.role"])
                    .where("space_members.space_id", "=", input.spaceId)
                    .where("space_members.user_id", "=", input.userId)
                    .executeTakeFirst();

                if (!targetMembership) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Member not found in this space",
                    });
                }

                const targetIsOwner =
                    targetMembership.role === ("owner" as unknown as SpaceMembers["role"]);

                if (targetIsOwner && input.role !== "owner") {
                    const ownerCountResult = await trx
                        .selectFrom("space_members")
                        .select((eb) => eb.fn.count("space_members.user_id").as("count"))
                        .where("space_members.space_id", "=", input.spaceId)
                        .where("space_members.role", "in", ["owner"])
                        .executeTakeFirstOrThrow();

                    const ownerCount = Number(ownerCountResult.count);

                    if (ownerCount <= 1) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: "Space must have at least one owner",
                        });
                    }
                }

                const updateResult = await trx
                    .updateTable("space_members")
                    .set({ role: input.role as unknown as SpaceMembers["role"] })
                    .where("space_members.space_id", "=", input.spaceId)
                    .where("space_members.user_id", "=", input.userId)
                    .executeTakeFirst();

                if (Number(updateResult.numUpdatedRows) === 0) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Member not found in this space",
                    });
                }
            })
        );
        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to change member role",
            });
        }
        return { message: "Member role changed successfully" };
    });
