import { TRPCError } from "@trpc/server";
import { z } from "zod";
import publicProcedure from "../../../trpc/middlewares/public.mjs";
import { safeAwait } from "../../../utils/safeAwait.mjs";
import { authorizeTmpJWT, signTmpJWT } from "./helper.mjs";

export const verifyCode = publicProcedure
    .input(
        z.object({
            code: z.string().length(6, "Code must be 6 digits"),
            token: z.string(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const { qb } = ctx.services;
        const { token } = input;
        const tmpUser = await authorizeTmpJWT(token);

        if (!tmpUser || tmpUser.purpose !== "signup") {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired token." });
        }

        const [verificationCodeError, verificationCode] = await safeAwait(
            qb
                .selectFrom("email_verification_codes")
                .select(["id", "code", "expires_at"])
                .where("tmp_user_id", "=", tmpUser.tempUserId)
                .where("expires_at", ">", new Date())
                .orderBy("created_at", "desc")
                .executeTakeFirstOrThrow()
        );

        if (verificationCodeError) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Invalid or expired verification code. Please request a new code.",
            });
        }

        if (verificationCode.code !== input.code) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Invalid verification code. Please try again.",
            });
        }

        const [updateError] = await safeAwait(
            qb.transaction().execute(async (trx) => {
                await trx
                    .deleteFrom("email_verification_codes")
                    .where("id", "=", verificationCode.id)
                    .executeTakeFirstOrThrow();

                await trx
                    .updateTable("tmp_users")
                    .set({ is_email_verified: true })
                    .where("id", "=", tmpUser.tempUserId)
                    .executeTakeFirstOrThrow();
            })
        );

        if (updateError) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to verify code. Please try again later.",
            });
        }

        const signupVerifiedToken = signTmpJWT(
            { tempUserId: tmpUser.tempUserId, purpose: "signup-verified" },
            30 * 60
        );

        return {
            token: signupVerifiedToken,
            message: "Email verified successfully.",
        };
    });
