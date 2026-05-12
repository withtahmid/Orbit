import { z } from "zod";
import { sql } from "kysely";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { TRPCError } from "@trpc/server";
import { resolveSpaceMembership } from "./utils/resolveSpaceMembership.mjs";
import type { SpaceMembers } from "../../db/kysely/types.mjs";

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
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as SpaceMembers["role"][],
                });

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

                // Look up the removed users' emails BEFORE deleting their
                // memberships so we can revoke any pending invites still
                // outstanding to them — otherwise a kicked user could
                // re-enter the space by clicking the old invite link they
                // already had in their inbox. Mirrors leave.mts.
                const removed = await trx
                    .selectFrom("users")
                    .select(["email"])
                    .where("id", "in", input.userIds)
                    .execute();

                await trx
                    .deleteFrom("space_members")
                    .where("space_members.space_id", "=", input.spaceId)
                    .where("space_members.user_id", "in", input.userIds)
                    .execute();

                const removedEmails = removed
                    .map((u) => u.email?.toLowerCase())
                    .filter((e): e is string => !!e);
                if (removedEmails.length > 0) {
                    await trx
                        .updateTable("space_invites")
                        .set({ revoked_at: new Date().toISOString() })
                        .where("space_id", "=", input.spaceId)
                        .where(sql`lower(email)`, "in", removedEmails)
                        .where("accepted_at", "is", null)
                        .where("revoked_at", "is", null)
                        .execute();
                }
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
