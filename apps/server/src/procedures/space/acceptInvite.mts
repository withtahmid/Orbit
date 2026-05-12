import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import type { SpaceMembers } from "../../db/kysely/types.mjs";

type Role = "owner" | "editor" | "viewer";
const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export const acceptInvite = authorizedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .output(z.object({ spaceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
        const [err, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                // forUpdate prevents two concurrent accepts of the same
                // token from both passing the "accepted_at IS NULL" check.
                const invite = await trx
                    .selectFrom("space_invites")
                    .select([
                        "id",
                        "space_id",
                        "role",
                        "expires_at",
                        "accepted_at",
                        "revoked_at",
                    ])
                    .where("token", "=", input.token)
                    .forUpdate()
                    .executeTakeFirst();
                if (!invite) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Invite not found",
                    });
                }
                if (invite.revoked_at) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "This invite has been revoked",
                    });
                }
                if (invite.accepted_at) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "This invite has already been accepted",
                    });
                }
                const expires =
                    invite.expires_at instanceof Date
                        ? invite.expires_at.getTime()
                        : new Date(String(invite.expires_at)).getTime();
                if (expires < Date.now()) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "This invite has expired",
                    });
                }

                const inviteRole = invite.role as unknown as Role;
                const existing = await trx
                    .selectFrom("space_members")
                    .select(["role"])
                    .where("space_id", "=", invite.space_id)
                    .where("user_id", "=", ctx.auth.user.id)
                    .executeTakeFirst();

                if (!existing) {
                    await trx
                        .insertInto("space_members")
                        .values({
                            space_id: invite.space_id,
                            user_id: ctx.auth.user.id,
                            role: invite.role as unknown as SpaceMembers["role"],
                        })
                        .execute();
                } else {
                    // Upgrade the member if the invite confers a higher
                    // role. Never auto-downgrade — an existing owner who
                    // accepts a viewer invite should keep their owner
                    // role rather than silently demote themselves.
                    const currentRank = ROLE_RANK[existing.role as unknown as Role] ?? 0;
                    const inviteRank = ROLE_RANK[inviteRole] ?? 0;
                    if (inviteRank > currentRank) {
                        await trx
                            .updateTable("space_members")
                            .set({
                                role: invite.role as unknown as SpaceMembers["role"],
                            })
                            .where("space_id", "=", invite.space_id)
                            .where("user_id", "=", ctx.auth.user.id)
                            .execute();
                    }
                }

                await trx
                    .updateTable("space_invites")
                    .set({
                        accepted_at: new Date().toISOString(),
                        accepted_by_user_id: ctx.auth.user.id,
                    })
                    .where("id", "=", invite.id)
                    .execute();

                return { spaceId: invite.space_id };
            })
        );
        if (err) {
            if (err instanceof TRPCError) throw err;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: err.message || "Failed to accept invite",
            });
        }
        return result;
    });
