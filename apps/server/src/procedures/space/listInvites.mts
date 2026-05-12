import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "./utils/resolveSpaceMembership.mjs";
import type { SpaceMembers } from "../../db/kysely/types.mjs";

export const listInvites = authorizedProcedure
    .input(z.object({ spaceId: z.string().uuid() }))
    .output(
        z.array(
            z.object({
                id: z.string().uuid(),
                email: z.string(),
                role: z.enum(["owner", "editor", "viewer"]),
                expiresAt: z.string(),
                invitedByName: z.string(),
                createdAt: z.string(),
            })
        )
    )
    .query(async ({ ctx, input }) => {
        const [err, rows] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                });

                return trx
                    .selectFrom("space_invites")
                    .innerJoin("users", "users.id", "space_invites.invited_by")
                    .select([
                        "space_invites.id",
                        "space_invites.email",
                        "space_invites.role",
                        "space_invites.expires_at",
                        "space_invites.created_at",
                        "users.first_name",
                        "users.last_name",
                    ])
                    .where("space_invites.space_id", "=", input.spaceId)
                    .where("space_invites.accepted_at", "is", null)
                    .where("space_invites.revoked_at", "is", null)
                    .where("space_invites.expires_at", ">", new Date())
                    .orderBy("space_invites.created_at", "desc")
                    .execute();
            })
        );
        if (err) {
            if (err instanceof TRPCError) throw err;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: err.message || "Failed to list invites",
            });
        }
        return rows.map((r) => ({
            id: r.id,
            email: r.email,
            role: r.role as unknown as "owner" | "editor" | "viewer",
            expiresAt:
                r.expires_at instanceof Date
                    ? r.expires_at.toISOString()
                    : String(r.expires_at),
            createdAt:
                r.created_at instanceof Date
                    ? r.created_at.toISOString()
                    : String(r.created_at),
            invitedByName: `${r.first_name} ${r.last_name}`.trim(),
        }));
    });
