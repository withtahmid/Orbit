import { z } from "zod";
import publicProcedure from "../../../trpc/middlewares/public.mjs";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcrypt";
import { sql } from "kysely";
import { signJWT } from "../../../trpc/auth.mjs";
import { authorizeTmpJWT } from "./helper.mjs";
import { CONFIG } from "../../../config/config.mjs";
import { safeAwait } from "../../../utils/safeAwait.mjs";
import { logger } from "../../../utils/logger.mjs";
// ─── Step 3: Complete Signup ───────────────────────────────────────────────────
export const completeSignup = publicProcedure
    .input(
        z
            .object({
                token: z.string(),
                firstName: z.string().min(1, "First name is required").max(100),
                lastName: z.string().min(1, "Last name is required").max(100),
                password: z.string().min(8, "Password must be at least 8 characters"),
                confirmPassword: z
                    .string()
                    .min(8, "Confirm password must be at least 8 characters"),
            })
            .refine((data) => data.password === data.confirmPassword, {
                message: "Passwords do not match",
            })
    )
    .mutation(async ({ ctx, input }) => {
        const { qb } = ctx.services;
        const { token } = input;
        const tmpUser = await authorizeTmpJWT(token);

        if (!tmpUser || tmpUser.purpose !== "signup-verified") {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired token." });
        }
        // Verify pre-signup user exists
        const preUser = await qb
            .selectFrom("tmp_users")
            .select(["id", "email"])
            .where("id", "=", tmpUser.tempUserId)
            .executeTakeFirst();

        if (!preUser) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "Invalid signup session. Please restart the signup process.",
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(input.password, CONFIG.AUTH.SALT_ROUNDS);

        // Move to users table
        const [error, userData] = await safeAwait(
            qb.transaction().execute(async (trx) => {
                const user = await trx
                    .insertInto("users")
                    .values({
                        id: preUser.id,
                        email: preUser.email,
                        first_name: input.firstName,
                        last_name: input.lastName,
                        password_hash: passwordHash,
                    })
                    .returning(["id"])
                    .executeTakeFirstOrThrow();
                await trx.deleteFrom("tmp_users").where("id", "=", preUser.id).execute();
                return user;
            })
        );
        if (error) {
            logger.error(
                `Transaction error during signup completion for temp user ${tmpUser.tempUserId}: ${error}`
            );
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to complete signup. Please try again later.",
            });
        }

        // Issue final auth JWT
        const authToken = signJWT({ userId: userData.id }, 7 * 24 * 60 * 60);

        return {
            token: authToken,
            user: {
                id: preUser.id,
                email: preUser.email,
                name: `${input.firstName} ${input.lastName}`,
            },
        };
    });
