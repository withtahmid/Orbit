import { z } from "zod";
import bcrypt from "bcrypt";
import { sql } from "kysely";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { signJWT } from "../../trpc/auth.mjs";
import { CONFIG } from "../../config/config.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";

export const changePassword = authorizedProcedure
    .input(
        z
            .object({
                currentPassword: z.string().min(1, "Current password is required"),
                newPassword: z.string().min(8, "Password must be at least 8 characters"),
                confirmPassword: z.string().min(8),
            })
            .refine((d) => d.newPassword === d.confirmPassword, {
                message: "Passwords do not match",
                path: ["confirmPassword"],
            })
    )
    .output(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
        const userId = ctx.auth.user.id;

        const [err, row] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const me = await trx
                    .selectFrom("users")
                    .select(["id", "password_hash"])
                    .where("id", "=", userId)
                    .forUpdate()
                    .executeTakeFirst();
                if (!me) {
                    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
                }
                const ok = await bcrypt.compare(input.currentPassword, me.password_hash);
                if (!ok) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Current password is incorrect",
                    });
                }
                if (input.currentPassword === input.newPassword) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "New password must be different from your current password",
                    });
                }
                const hash = await bcrypt.hash(input.newPassword, CONFIG.AUTH.SALT_ROUNDS);
                return trx
                    .updateTable("users")
                    .set({
                        password_hash: hash,
                        token_version: sql`token_version + 1`,
                    })
                    .where("id", "=", userId)
                    .returning(["token_version"])
                    .executeTakeFirstOrThrow();
            })
        );
        if (err) {
            if (err instanceof TRPCError) throw err;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: err.message || "Failed to change password",
            });
        }

        // Bumping token_version invalidates the caller's own session too.
        // Hand back a fresh JWT so the caller stays logged in without
        // forcing a re-prompt; every other session is now dead.
        return { token: signJWT({ userId, tokenVersion: row.token_version }) };
    });
