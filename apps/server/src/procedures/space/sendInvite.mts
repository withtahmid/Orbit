import crypto from "crypto";
import { z } from "zod";
import { sql } from "kysely";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "./utils/resolveSpaceMembership.mjs";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import SpaceInviteEmail from "../../services/mail/templates/SpaceInviteEmail.js";
import { ENV } from "../../env.mjs";
import { logger } from "../../utils/logger.mjs";

const INVITE_TTL_HOURS = 72;

export const sendInvite = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            email: z
                .string()
                .email("Please enter a valid email address")
                .transform((e) => e.toLowerCase()),
            role: z.enum(["owner", "editor", "viewer"]),
        })
    )
    .output(
        z.object({
            id: z.string().uuid(),
            email: z.string(),
            role: z.enum(["owner", "editor", "viewer"]),
            expiresAt: z.string(),
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
                if (input.role === "owner" && !requesterIsOwner) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "Only owners can invite as owner",
                    });
                }

                // Refuse self-invite: the caller is already a member by
                // definition (resolveSpaceMembership succeeded above), and
                // letting the form spam yourself with invite tokens isn't
                // useful.
                const me = await trx
                    .selectFrom("users")
                    .select(["email"])
                    .where("id", "=", ctx.auth.user.id)
                    .executeTakeFirst();
                if (me && me.email.toLowerCase() === input.email) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "You are already a member of this space",
                    });
                }

                // Match users by lower(email) so legacy rows with a mixed-
                // case email (`users.email` is unique but not normalized
                // at the DB layer) are still caught as "already a member".
                const existingMember = await trx
                    .selectFrom("space_members")
                    .innerJoin("users", "users.id", "space_members.user_id")
                    .select(["users.id"])
                    .where("space_members.space_id", "=", input.spaceId)
                    .where(sql`lower(users.email)`, "=", input.email)
                    .executeTakeFirst();
                if (existingMember) {
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: "That user is already a member of this space",
                    });
                }

                const token = crypto.randomBytes(32).toString("hex");
                const expiresAt = new Date(
                    Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000
                );

                // Rotate any existing pending invite for (space, email) — the
                // partial-unique index allows multiple rows once one is
                // accepted/revoked but only one truly pending row at a time.
                await trx
                    .updateTable("space_invites")
                    .set({ revoked_at: new Date().toISOString() })
                    .where("space_id", "=", input.spaceId)
                    .where("email", "=", input.email)
                    .where("accepted_at", "is", null)
                    .where("revoked_at", "is", null)
                    .execute();

                const row = await trx
                    .insertInto("space_invites")
                    .values({
                        space_id: input.spaceId,
                        email: input.email,
                        role: input.role as unknown as SpaceMembers["role"],
                        token,
                        invited_by: ctx.auth.user.id,
                        expires_at: expiresAt.toISOString(),
                    })
                    .returning(["id", "email", "role", "expires_at", "token"])
                    .executeTakeFirstOrThrow();

                const space = await trx
                    .selectFrom("spaces")
                    .select(["name"])
                    .where("id", "=", input.spaceId)
                    .executeTakeFirstOrThrow();

                const inviter = await trx
                    .selectFrom("users")
                    .select(["first_name", "last_name"])
                    .where("id", "=", ctx.auth.user.id)
                    .executeTakeFirstOrThrow();

                return {
                    id: row.id,
                    email: row.email,
                    role: row.role as unknown as "owner" | "editor" | "viewer",
                    expiresAt:
                        row.expires_at instanceof Date
                            ? row.expires_at.toISOString()
                            : String(row.expires_at),
                    token: row.token,
                    spaceName: space.name,
                    inviterName: `${inviter.first_name} ${inviter.last_name}`.trim(),
                };
            })
        );

        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to create invite",
            });
        }

        const acceptUrl = `${ENV.WEB_URL.replace(/\/$/, "")}/invite/${result.token}`;
        const [mailErr] = await safeAwait(
            ctx.services.mailer.sendEmail(
                input.email,
                `${result.inviterName} invited you to ${result.spaceName} on Orbit`,
                SpaceInviteEmail,
                {
                    spaceName: result.spaceName,
                    inviterName: result.inviterName || "Someone",
                    role: result.role,
                    acceptUrl,
                    expiresInHours: INVITE_TTL_HOURS,
                }
            )
        );
        if (mailErr) {
            logger.error(`Failed to send invite email to ${input.email}: ${mailErr}`);
        }

        return {
            id: result.id,
            email: result.email,
            role: result.role,
            expiresAt: result.expiresAt,
        };
    });
