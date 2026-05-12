import { z } from "zod";
import { TRPCError } from "@trpc/server";
import publicProcedure from "../../trpc/middlewares/public.mjs";

/**
 * Public lookup so the accept-invite page can render space name + role
 * before the user signs in. Token is the credential — without it, no
 * info is leaked. Returns minimal data (no inviter email, no member
 * count).
 */
export const inviteInfo = publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .output(
        z.object({
            email: z.string(),
            role: z.enum(["owner", "editor", "viewer"]),
            spaceName: z.string(),
            inviterName: z.string(),
            expiresAt: z.string(),
            status: z.enum(["pending", "expired", "accepted", "revoked"]),
        })
    )
    .query(async ({ ctx, input }) => {
        const invite = await ctx.services.qb
            .selectFrom("space_invites")
            .innerJoin("spaces", "spaces.id", "space_invites.space_id")
            .innerJoin("users", "users.id", "space_invites.invited_by")
            .select([
                "space_invites.email",
                "space_invites.role",
                "space_invites.expires_at",
                "space_invites.accepted_at",
                "space_invites.revoked_at",
                "spaces.name as space_name",
                "users.first_name",
                "users.last_name",
            ])
            .where("space_invites.token", "=", input.token)
            .executeTakeFirst();
        if (!invite) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
        }
        const expiresAtIso =
            invite.expires_at instanceof Date
                ? invite.expires_at.toISOString()
                : String(invite.expires_at);
        let status: "pending" | "expired" | "accepted" | "revoked" = "pending";
        if (invite.revoked_at) status = "revoked";
        else if (invite.accepted_at) status = "accepted";
        else if (new Date(expiresAtIso).getTime() < Date.now()) status = "expired";

        return {
            email: invite.email,
            role: invite.role as unknown as "owner" | "editor" | "viewer",
            spaceName: invite.space_name,
            inviterName: `${invite.first_name} ${invite.last_name}`.trim(),
            expiresAt: expiresAtIso,
            status,
        };
    });
