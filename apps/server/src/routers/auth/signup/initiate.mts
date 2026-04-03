import { z } from "zod";
import publicProcedure from "../../../trpc/middlewares/public.mjs";
import { TRPCError } from "@trpc/server";
import VerificationCodeEmail from "../../../services/mail/templates/VerificationCodeEmail.js";
import { logger } from "../../../utils/logger.mjs";
import { safeAwait } from "../../../utils/safeAwait.mjs";
import { generateOTP } from "../utils/generateOTP.mjs";
import { CONFIG } from "../../../config/config.mjs";
import { signTmpJWT } from "./helper.mjs";

export const initiateSignup = publicProcedure
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

        const [existingUserError, existingUser] = await safeAwait(
            qb
                .selectFrom("users")
                .select(["id"])
                .where("email", "=", email.toLowerCase())
                .executeTakeFirst()
        );

        if (existingUserError) {
            logger.error(
                `Database error while checking existing user for email ${email}: ${existingUserError}`
            );
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "An error occurred while processing your request. Please try again later.",
            });
        }

        if (existingUser) {
            throw new TRPCError({
                code: "CONFLICT",
                message: "An account with this email already exists. Please sign in.",
            });
        }

        const [error, data] = await safeAwait(
            qb.transaction().execute(async (trx) => {
                const deletedTempUsers = await trx
                    .deleteFrom("tmp_users")
                    .where("email", "=", email)
                    .returning(["id"])
                    .execute();

                if (deletedTempUsers.length > 0) {
                    await trx
                        .deleteFrom("email_verification_codes")
                        .where(
                            "tmp_user_id",
                            "in",
                            deletedTempUsers.map((u) => u.id)
                        )
                        .execute();
                }

                const tempUser = await trx
                    .insertInto("tmp_users")
                    .values({ email: email.toLowerCase() })
                    .returning(["id"])
                    .executeTakeFirst();

                if (!tempUser) {
                    throw new Error("Failed to create temporary user");
                }

                const code = generateOTP();
                const expiresAt = new Date(Date.now() + CONFIG.AUTH.OTP_EXPIRY_MINUTES * 60 * 1000);

                await trx
                    .insertInto("email_verification_codes")
                    .values({
                        tmp_user_id: tempUser.id,
                        purpose: "signup",
                        code,
                        expires_at: expiresAt.toISOString(),
                    })
                    .execute();
                return {
                    tempUserId: tempUser.id,
                    code,
                };
            })
        );
        if (error) {
            logger.error(`Transaction error during signup initiation for email ${email}: ${error}`);
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "An error occurred while processing your request. Please try again later.",
            });
        }

        const [emailSendError] = await safeAwait(
            ctx.services.mailer.sendEmail(
                email.toLowerCase(),
                "Your verification code",
                VerificationCodeEmail,
                { code: data.code, email: email.toLowerCase() }
            )
        );

        if (emailSendError) {
            logger.error(`Failed to send verification email to ${email}: ${emailSendError}`);
        }

        const token = signTmpJWT({ tempUserId: data.tempUserId, purpose: "signup" }, 15 * 60);

        return {
            token,
            message: "Verification code sent to your email.",
        };
    });
