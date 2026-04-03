import { TRPCError } from "@trpc/server";
import { z } from "zod";
import publicProcedure from "../../../trpc/middlewares/public.mjs";
import { logger } from "../../../utils/logger.mjs";
import { safeAwait } from "../../../utils/safeAwait.mjs";
import { authorizeTmpJWT, signTmpJWT } from "../signup/helper.mjs";

export const verifyPasswordResetCode = publicProcedure
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

        if (!tmpUser || tmpUser.purpose !== "password-reset") {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired token." });
        }

        const [verificationCodeError, verificationCode] = await safeAwait(
            qb
                .selectFrom("email_verification_codes")
                .select(["id", "code", "expires_at"])
                .where("user_id", "=", tmpUser.tempUserId)
                .where("purpose", "=", "password_reset")
                .where("expires_at", ">", new Date())
                .orderBy("created_at", "desc")
                .executeTakeFirst()
        );

        if (verificationCodeError) {
            logger.error(
                `Database error while fetching verification code for user ${tmpUser.tempUserId}: ${verificationCodeError}`
            );
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "An error occurred while processing your request. Please try again later.",
            });
        }

        if (!verificationCode || verificationCode.code !== input.code) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Invalid or expired verification code. Please try again.",
            });
        }

        const [verifiedCodesDeleteError] = await safeAwait(
            qb
                .deleteFrom("email_verification_codes")
                .where("id", "=", verificationCode.id)
                .execute()
        );

        if (verifiedCodesDeleteError) {
            logger.error(
                `Database error while deleting used verification code for user ${tmpUser.tempUserId}: ${verifiedCodesDeleteError}`
            );
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "An error occurred while processing your request. Please try again later.",
            });
        }

        const verifiedToken = signTmpJWT(
            { tempUserId: tmpUser.tempUserId, purpose: "password-reset-verified" },
            30 * 60
        );

        return {
            token: verifiedToken,
            message: "Code verified successfully.",
        };
    });
