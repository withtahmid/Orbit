import { z } from "zod";
import { sql } from "kysely";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import type { SpaceMembers } from "../../db/kysely/types.mjs";

/**
 * Self-remove from a space. Refuses if the caller is the sole owner —
 * they must transfer ownership or delete the space first. Mirrors the
 * sole-owner guard in `removeMember.mts`.
 *
 * Also revokes any pending invites that were still outstanding to the
 * caller's email in this space — otherwise the user would find a stale
 * "you have an invite" link that silently re-adds them after they just
 * opted out.
 */
export const leaveSpace = authorizedProcedure
    .input(z.object({ spaceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
        const [error] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const membership = await trx
                    .selectFrom("space_members")
                    .select(["role"])
                    .where("space_id", "=", input.spaceId)
                    .where("user_id", "=", ctx.auth.user.id)
                    .executeTakeFirst();
                if (!membership) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "You are not a member of this space",
                    });
                }

                const ownerRole = "owner" as unknown as SpaceMembers["role"];
                if (membership.role === ownerRole) {
                    const otherOwners = await trx
                        .selectFrom("space_members")
                        .select((eb) => eb.fn.count("user_id").as("count"))
                        .where("space_id", "=", input.spaceId)
                        .where("role", "=", ownerRole)
                        .where("user_id", "!=", ctx.auth.user.id)
                        .executeTakeFirstOrThrow();
                    if (Number(otherOwners.count) === 0) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message:
                                "You are the sole owner of this space. Transfer ownership or delete the space first.",
                        });
                    }
                }

                await trx
                    .deleteFrom("space_members")
                    .where("space_id", "=", input.spaceId)
                    .where("user_id", "=", ctx.auth.user.id)
                    .execute();

                // Revoke any pending invites still outstanding to this
                // user's email in this space — case-insensitive match
                // because invite rows are stored lower-cased while
                // `users.email` may not be normalized.
                const me = await trx
                    .selectFrom("users")
                    .select(["email"])
                    .where("id", "=", ctx.auth.user.id)
                    .executeTakeFirst();
                if (me?.email) {
                    await trx
                        .updateTable("space_invites")
                        .set({ revoked_at: new Date().toISOString() })
                        .where("space_id", "=", input.spaceId)
                        .where(sql`lower(email)`, "=", me.email.toLowerCase())
                        .where("accepted_at", "is", null)
                        .where("revoked_at", "is", null)
                        .execute();
                }
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to leave space",
            });
        }
        return { ok: true };
    });
