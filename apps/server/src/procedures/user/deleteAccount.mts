import { z } from "zod";
import bcrypt from "bcrypt";
import { sql } from "kysely";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import type { SpaceMembers } from "../../db/kysely/types.mjs";

/**
 * Soft-delete the signed-in user.
 *
 * A hard `DELETE FROM users` is impossible for anyone who has ever
 * created shared data — `spaces.created_by`, `spaces.updated_by`,
 * `transactions.created_by`, and `envelop_allocations.created_by` are all
 * `ON DELETE RESTRICT` (see migration 027), so the FKs block the delete
 * and Postgres surfaces it
 * as a generic 500. Instead, we tombstone the user: anonymize their
 * identifying fields, set `deleted_at`, bump `token_version` (which
 * invalidates every outstanding JWT via `fetchUserFromJWT`), and drop
 * their `space_members` rows so they no longer have access to any space.
 * The `users.id` row stays so historical authorship FKs remain valid.
 *
 * Refuses if the caller is the sole owner of any space — they must
 * transfer or delete the space first, otherwise the space ends up
 * unmanageable.
 */
export const deleteAccount = authorizedProcedure
    .input(z.object({ currentPassword: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
        const userId = ctx.auth.user.id;

        const [error] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const me = await trx
                    .selectFrom("users")
                    .select(["id", "password_hash", "deleted_at"])
                    .where("id", "=", userId)
                    .forUpdate()
                    .executeTakeFirst();
                if (!me || me.deleted_at) {
                    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
                }
                const ok = await bcrypt.compare(input.currentPassword, me.password_hash);
                if (!ok) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Current password is incorrect",
                    });
                }

                const ownerRole = "owner" as unknown as SpaceMembers["role"];
                const ownedSpaces = await trx
                    .selectFrom("space_members")
                    .innerJoin("spaces", "spaces.id", "space_members.space_id")
                    .select(["spaces.id", "spaces.name"])
                    .where("space_members.user_id", "=", userId)
                    .where("space_members.role", "=", ownerRole)
                    .execute();

                const soleOwnerOf: string[] = [];
                for (const s of ownedSpaces) {
                    const otherOwners = await trx
                        .selectFrom("space_members")
                        .select((eb) => eb.fn.count("user_id").as("count"))
                        .where("space_id", "=", s.id)
                        .where("role", "=", ownerRole)
                        .where("user_id", "!=", userId)
                        .executeTakeFirstOrThrow();
                    if (Number(otherOwners.count) === 0) {
                        soleOwnerOf.push(s.name);
                    }
                }
                if (soleOwnerOf.length > 0) {
                    // List every blocker in one message so the user can
                    // fix them in one pass instead of retrying-and-being-
                    // told-the-next-one-each-time.
                    const list =
                        soleOwnerOf.length === 1
                            ? `"${soleOwnerOf[0]}"`
                            : soleOwnerOf
                                  .slice(0, -1)
                                  .map((n) => `"${n}"`)
                                  .join(", ") + ` and "${soleOwnerOf[soleOwnerOf.length - 1]}"`;
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: `You are the sole owner of ${list}. Transfer ownership or delete ${
                            soleOwnerOf.length === 1 ? "it" : "them"
                        } first.`,
                    });
                }

                // Free up the email for future signups by namespacing it
                // under the user's id. Bcrypt-hash of a random string makes
                // the password column non-comparable to any real input
                // without changing its NOT NULL/varchar(255) shape.
                const tombstoneEmail = `deleted+${userId}@orbit.local`;
                await trx
                    .updateTable("users")
                    .set({
                        email: tombstoneEmail,
                        first_name: "Deleted",
                        last_name: "User",
                        avatar_file_id: null,
                        password_hash: "!",
                        deleted_at: sql`NOW()`,
                        token_version: sql`token_version + 1`,
                    })
                    .where("id", "=", userId)
                    .execute();

                // Drop space memberships so the tombstoned user no longer
                // appears in member lists or has read access.
                await trx
                    .deleteFrom("space_members")
                    .where("user_id", "=", userId)
                    .execute();

                // Revoke pending invites the user issued (they're no
                // longer around to vouch for them) and any invites still
                // outstanding to their old address.
                await trx
                    .updateTable("space_invites")
                    .set({ revoked_at: sql`NOW()` })
                    .where("invited_by", "=", userId)
                    .where("accepted_at", "is", null)
                    .where("revoked_at", "is", null)
                    .execute();
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to delete account",
            });
        }
        return { ok: true };
    });
