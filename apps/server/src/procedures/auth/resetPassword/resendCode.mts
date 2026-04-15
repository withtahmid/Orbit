import { TRPCError } from "@trpc/server";
import publicProcedure from "../../../trpc/middlewares/public.mjs";
import VerificationCodeEmail from "../../../services/mail/templates/VerificationCodeEmail.js";
import { logger } from "../../../utils/logger.mjs";
import { z } from "zod";
import { authorizeTmpJWT } from "../signup/helper.mjs";
import { safeAwait } from "../../../utils/safeAwait.mjs";
import { CONFIG } from "../../../config/config.mjs";
import { generateOTP } from "../utils/generateOTP.mjs";

export const resendPasswordResetCode = publicProcedure
    .input(
        z.object({
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

        const [lastCodeError, lastCode] = await safeAwait(
            qb
                .selectFrom("email_verification_codes")
                .select(["created_at"])
                .where("user_id", "=", tmpUser.tempUserId)
                .where("purpose", "=", "password_reset")
                .orderBy("created_at", "desc")
                .executeTakeFirst()
        );

        if (lastCodeError) {
            logger.error(
                `Database error while fetching last verification code for user ${tmpUser.tempUserId}: ${lastCodeError}`
            );
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "An error occurred while processing your request. Please try again later.",
            });
        }

        if (lastCode) {
            const secondsSinceLastCode =
                (Date.now() - new Date(lastCode.created_at).getTime()) / 1000;
            if (secondsSinceLastCode < CONFIG.AUTH.RESEND_COOLDOWN_SECONDS) {
                const waitSeconds = Math.ceil(
                    CONFIG.AUTH.RESEND_COOLDOWN_SECONDS - secondsSinceLastCode
                );
                throw new TRPCError({
                    code: "TOO_MANY_REQUESTS",
                    message: `Please wait ${waitSeconds} seconds before requesting a new code.`,
                });
            }
        }

        const [error, data] = await safeAwait(
            qb.transaction().execute(async (trx) => {
                const dbUser = await trx
                    .selectFrom("users")
                    .select(["email", "id"])
                    .where("id", "=", tmpUser.tempUserId)
                    .executeTakeFirst();
                if (!dbUser) {
                    throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
                }

                await trx
                    .deleteFrom("email_verification_codes")
                    .where("user_id", "=", tmpUser.tempUserId)
                    .where("purpose", "=", "password_reset")
                    .execute();

                const code = generateOTP();
                const expiresAt = new Date(Date.now() + CONFIG.AUTH.OTP_EXPIRY_MINUTES * 60 * 1000);

                await trx
                    .insertInto("email_verification_codes")
                    .values({
                        user_id: dbUser.id,
                        code,
                        expires_at: expiresAt.toISOString(),
                        purpose: "password_reset",
                    })
                    .execute();
                return {
                    code,
                    email: dbUser.email,
                };
            })
        );
        if (error) {
            logger.error(
                `Transaction error during password reset code resend for user ${tmpUser.tempUserId}: ${error}`
            );
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "An error occurred while processing your request. Please try again later.",
            });
        }

        const [emailSendError] = await safeAwait(
            ctx.services.mailer.sendEmail(
                data.email,
                "Your verification code",
                VerificationCodeEmail,
                { code: data.code, email: data.email }
            )
        );

        if (emailSendError) {
            logger.error(`Failed to send password reset email to ${data.email}: ${emailSendError}`);
        }

        return {
            message: "A new verification code has been sent to your email.",
        };
    });
