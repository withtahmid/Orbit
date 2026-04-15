import { z } from "zod";
import publicProcedure from "../../../trpc/middlewares/public.mjs";
import VerificationCodeEmail from "../../../services/mail/templates/VerificationCodeEmail.js";
import { logger } from "../../../utils/logger.mjs";
import { generateOTP } from "../utils/generateOTP.mjs";
import { CONFIG } from "../../../config/config.mjs";
import { safeAwait } from "../../../utils/safeAwait.mjs";
import { TRPCError } from "@trpc/server";
import { signTmpJWT } from "../signup/helper.mjs";

export const initiatePasswordReset = publicProcedure
    .input(
        z.object({
            email: z
                .string()
                .email("Please enter a valid email address")
                .transform((email) => email.toLowerCase()),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const { email } = input;
        const { qb } = ctx.services;

        const [dbUserError, dbUser] = await safeAwait(
            qb
                .selectFrom("users")
                .select(["id"])
                .where("email", "=", email.toLowerCase())
                .executeTakeFirst()
        );

        if (dbUserError) {
            logger.error(
                `Database error while fetching user for password reset with email ${email}: ${dbUserError}`
            );
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "An error occurred while processing your request. Please try again later.",
            });
        }

        if (!dbUser) {
            return {
                token: null,
                message:
                    "If an active account with that email exists, a verification code has been sent.",
            };
        }

        const userId = dbUser.id;

        const [error, data] = await safeAwait(
            qb.transaction().execute(async (trx) => {
                await trx
                    .deleteFrom("email_verification_codes")
                    .where("purpose", "=", "password_reset")
                    .where("user_id", "=", userId)
                    .execute();

                const code = generateOTP();
                const expiresAt = new Date(Date.now() + CONFIG.AUTH.OTP_EXPIRY_MINUTES * 60 * 1000);

                await trx
                    .insertInto("email_verification_codes")
                    .values({
                        purpose: "password_reset",
                        user_id: userId,
                        code,
                        expires_at: expiresAt.toISOString(),
                    })
                    .execute();
                return {
                    code,
                };
            })
        );

        if (error) {
            logger.error(
                `Transaction error during password reset initiation for user ${userId}: ${error}`
            );
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to generate verification code. Please try again later.",
            });
        }

        const [emailSendError] = await safeAwait(
            ctx.services.mailer.sendEmail(
                email.toLowerCase(),
                "Your password reset verification code",
                VerificationCodeEmail,
                { code: data.code, email: email }
            )
        );

        if (emailSendError) {
            logger.error(`Failed to send password reset email to ${email}: ${emailSendError}`);
        }

        const token = signTmpJWT({ tempUserId: dbUser.id, purpose: "password-reset" }, 15 * 60);

        return {
            token,
            message:
                "If an active account with that email exists, a verification code has been sent.",
        };
    });
