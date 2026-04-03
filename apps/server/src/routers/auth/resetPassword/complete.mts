import { TRPCError } from "@trpc/server";
import bcrypt from "bcrypt";
import { z } from "zod";
import { CONFIG } from "../../../config/config.mjs";
import publicProcedure from "../../../trpc/middlewares/public.mjs";
import { safeAwait } from "../../../utils/safeAwait.mjs";
import { authorizeTmpJWT } from "../signup/helper.mjs";

export const completePasswordReset = publicProcedure
    .input(
        z
            .object({
                password: z.string().min(8, "Password must be at least 8 characters"),
                confirmPassword: z
                    .string()
                    .min(8, "Confirm password must be at least 8 characters"),
                token: z.string(),
            })
            .refine((data) => data.password === data.confirmPassword, {
                message: "Passwords do not match",
            })
    )

    .mutation(async ({ ctx, input }) => {
        const { qb } = ctx.services;
        const { token } = input;
        const tmpUser = await authorizeTmpJWT(token);

        if (!tmpUser || tmpUser.purpose !== "password-reset-verified") {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired token." });
        }

        const [dbUserError, dbUser] = await safeAwait(
            qb
                .selectFrom("users")
                .select(["id"])
                .where("id", "=", tmpUser.tempUserId)
                .executeTakeFirstOrThrow()
        );
        if (dbUserError) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "An error occurred while processing your request. Please try again later.",
            });
        }

        const passwordHash = await bcrypt.hash(input.password, CONFIG.AUTH.SALT_ROUNDS);

        const [updateError] = await safeAwait(
            qb
                .updateTable("users")
                .set({
                    password_hash: passwordHash,
                })
                .where("id", "=", dbUser.id)
                .execute()
        );

        if (updateError) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "An error occurred while processing your request. Please try again later.",
            });
        }

        return {
            message: "Password reset complete. You can now log in.",
        };
    });
