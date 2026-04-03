import { TRPCError } from "@trpc/server";
import publicProcedure from "../../../trpc/middlewares/public.mjs";
import VerificationCodeEmail from "../../../services/mail/templates/VerificationCodeEmail.js";
import { logger } from "../../../utils/logger.mjs";
import { z } from "zod";
import { authorizeTmpJWT, signTmpJWT } from "./helper.mjs";
import { CONFIG } from "../../../config/config.mjs";
import { safeAwait } from "../../../utils/safeAwait.mjs";
import { generateOTP } from "../utils/generateOTP.mjs";

// ─── Step 1b: Resend Code ──────────────────────────────────────────────────────
export const resendSignupCode = publicProcedure
    .input(
        z.object({
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

        const lastCode = await qb
            .selectFrom("email_verification_codes")
            .select(["created_at"])
            .where("tmp_user_id", "=", tmpUser.tempUserId)
            .where("purpose", "=", "signup")
            .orderBy("created_at", "desc")
            .executeTakeFirst();

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

        // Get user email from pre_signup_users
        const [tmpUserEmailError, tmpUserEmail] = await safeAwait(
            qb
                .selectFrom("tmp_users")
                .select(["email"])
                .where("id", "=", tmpUser.tempUserId)
                .executeTakeFirstOrThrow()
        );

        if (tmpUserEmailError) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Pre-signup user not found." });
        }

        const [error, data] = await safeAwait(
            qb.transaction().execute(async (trx) => {
                await trx
                    .deleteFrom("email_verification_codes")
                    .where("tmp_user_id", "=", tmpUser.tempUserId)
                    .where("purpose", "=", "signup")
                    .execute();

                const code = generateOTP();
                const expiresAt = new Date(Date.now() + CONFIG.AUTH.OTP_EXPIRY_MINUTES * 60 * 1000);

                await trx
                    .insertInto("email_verification_codes")
                    .values({
                        tmp_user_id: tmpUser.tempUserId,
                        purpose: "signup",
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
                `Transaction error during signup code resend for temp user ${tmpUser.tempUserId}: ${error}`
            );
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to generate new verification code. Please try again later.",
            });
        }

        const [emailSendError] = await safeAwait(
            ctx.services.mailer.sendEmail(
                tmpUserEmail.email,
                "Your verification code",
                VerificationCodeEmail,
                { code: data.code, email: tmpUserEmail.email }
            )
        );

        if (emailSendError) {
            logger.error(
                `Failed to send verification email to ${tmpUserEmail.email} during code resend: ${emailSendError}`
            );
        }

        return {
            message: "A new verification code has been sent to your email.",
        };
    });
