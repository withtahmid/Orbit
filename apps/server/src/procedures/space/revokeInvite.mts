import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "./utils/resolveSpaceMembership.mjs";
import type { SpaceMembers } from "../../db/kysely/types.mjs";

export const revokeInvite = authorizedProcedure
    .input(z.object({ spaceId: z.string().uuid(), inviteId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
        const [err] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const { membership } = await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                });

                const invite = await trx
                    .selectFrom("space_invites")
                    .select(["id", "role", "accepted_at", "revoked_at"])
                    .where("id", "=", input.inviteId)
                    .where("space_id", "=", input.spaceId)
                    .executeTakeFirst();
                if (!invite || invite.accepted_at || invite.revoked_at) {
                    // Idempotent: nothing to revoke. Don't leak existence
                    // for an invite that never existed in this space.
                    return;
                }

                const callerIsOwner =
                    membership.role === ("owner" as unknown as SpaceMembers["role"]);
                const inviteIsOwnerGrade =
                    invite.role === ("owner" as unknown as SpaceMembers["role"]);
                if (inviteIsOwnerGrade && !callerIsOwner) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "Only owners can revoke an owner-grade invite",
                    });
                }

                await trx
                    .updateTable("space_invites")
                    .set({ revoked_at: new Date().toISOString() })
                    .where("id", "=", input.inviteId)
                    .where("space_id", "=", input.spaceId)
                    .where("accepted_at", "is", null)
                    .where("revoked_at", "is", null)
                    .execute();
            })
        );
        if (err) {
            if (err instanceof TRPCError) throw err;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: err.message || "Failed to revoke invite",
            });
        }
        return { ok: true };
    });
