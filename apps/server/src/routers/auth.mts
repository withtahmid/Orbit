import { TRPCError } from "@trpc/server";
import bcrypt from "bcrypt";
import { sql } from "kysely";
import { z } from "zod";
import { signJWT } from "../trpc/auth.mjs";
import publicProcedure from "../trpc/middlewares/public.mjs";
import { router } from "../trpc/index.mjs";
import { generateId, generateOTP } from "../utils/generateId.mjs";
import { logger } from "../utils/logger.mjs";
import VerificationCodeEmail from "../services/mail/templates/VerificationCodeEmail.js";

const SALT_ROUNDS = 12;
const OTP_EXPIRY_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;

// ─── Step 1: Initiate Signup ───────────────────────────────────────────────────
const initiateSignup = publicProcedure
    .input(
        z.object({
            email: z.string().email("Please enter a valid email address"),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const { email } = input;
        const { qb } = ctx.services;

        // Check if a user with this email already exists
        const existingUser = await qb
            .selectFrom("users")
            .select(["id", "status"])
            .where("email", "=", email.toLowerCase())
            .executeTakeFirst();

        let userId: string;

        if (existingUser) {
            if (existingUser.status === "active") {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "An account with this email already exists. Please sign in.",
                });
            }
            // Reuse existing pending/verified user
            userId = existingUser.id;
        } else {
            // Create new user with pending status
            userId = generateId();
            await qb
                .insertInto("users")
                .values({
                    id: userId,
                    email: email.toLowerCase(),
                    status: "pending_verification",
                })
                .execute();
        }

        // Invalidate any existing unused codes for this user
        await qb
            .updateTable("email_verification_codes")
            .set({ used: true })
            .where("user_id", "=", userId)
            .where("used", "=", false)
            .execute();

        // Generate and store new OTP
        const code = generateOTP();
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

        await qb
            .insertInto("email_verification_codes")
            .values({
                id: generateId(),
                user_id: userId,
                code,
                expires_at: expiresAt.toISOString(),
                used: false,
            })
            .execute();

        // Send verification email
        try {
            await ctx.services.mailer.sendEmail(
                email.toLowerCase(),
                "Your verification code",
                VerificationCodeEmail,
                { code, email: email.toLowerCase() }
            );
            logger.info(`Verification code sent to ${email}`);
        } catch (error) {
            logger.error(`Failed to send verification email to ${email}: ${error}`);
            // Don't fail the request — the code is stored and can be resent
        }

        // Return a short-lived temp JWT for the signup flow
        const token = signJWT({ userId, purpose: "signup" }, 15 * 60);

        return {
            token,
            message: "Verification code sent to your email.",
        };
    });

// ─── Step 1b: Resend Code ──────────────────────────────────────────────────────
const resendCode = publicProcedure.mutation(async ({ ctx }) => {
    const user = ctx.auth.user;

    if (!user || (user.purpose !== "signup" && user.purpose !== "password-reset")) {
        throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid or expired session. Please restart the process.",
        });
    }

    const { qb } = ctx.services;

    // Rate limit: check when the last code was sent
    const lastCode = await qb
        .selectFrom("email_verification_codes")
        .select(["created_at"])
        .where("user_id", "=", user.userId)
        .orderBy("created_at", "desc")
        .executeTakeFirst();

    if (lastCode) {
        const secondsSinceLastCode =
            (Date.now() - new Date(lastCode.created_at).getTime()) / 1000;
        if (secondsSinceLastCode < RESEND_COOLDOWN_SECONDS) {
            const waitSeconds = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLastCode);
            throw new TRPCError({
                code: "TOO_MANY_REQUESTS",
                message: `Please wait ${waitSeconds} seconds before requesting a new code.`,
            });
        }
    }

    // Get user email
    const dbUser = await qb
        .selectFrom("users")
        .select(["email"])
        .where("id", "=", user.userId)
        .executeTakeFirst();

    if (!dbUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
    }

    // Invalidate old codes
    await qb
        .updateTable("email_verification_codes")
        .set({ used: true })
        .where("user_id", "=", user.userId)
        .where("used", "=", false)
        .execute();

    // Generate and store new OTP
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await qb
        .insertInto("email_verification_codes")
        .values({
            id: generateId(),
            user_id: user.userId,
            code,
            expires_at: expiresAt.toISOString(),
            used: false,
        })
        .execute();

    // Send verification email
    try {
        await ctx.services.mailer.sendEmail(
            dbUser.email,
            "Your verification code",
            VerificationCodeEmail,
            { code, email: dbUser.email }
        );
        logger.info(`Verification code resent to ${dbUser.email}`);
    } catch (error) {
        logger.error(`Failed to resend verification email: ${error}`);
    }

    return {
        message: "A new verification code has been sent to your email.",
    };
});

// ─── Step 2: Verify Code ───────────────────────────────────────────────────────
const verifyCode = publicProcedure
    .input(
        z.object({
            code: z.string().length(6, "Code must be 6 digits"),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const user = ctx.auth.user;

        if (!user || user.purpose !== "signup") {
            throw new TRPCError({
                code: "UNAUTHORIZED",
                message: "Invalid or expired signup session.",
            });
        }

        const { qb } = ctx.services;

        // Find a valid, unused code for this user
        const verificationCode = await qb
            .selectFrom("email_verification_codes")
            .select(["id", "code", "expires_at"])
            .where("user_id", "=", user.userId)
            .where("used", "=", false)
            .where("expires_at", ">", new Date())
            .orderBy("created_at", "desc")
            .executeTakeFirst();

        if (!verificationCode) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "No valid verification code found. Please request a new one.",
            });
        }

        if (verificationCode.code !== input.code) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Invalid verification code. Please try again.",
            });
        }

        // Mark code as used
        await qb
            .updateTable("email_verification_codes")
            .set({ used: true })
            .where("id", "=", verificationCode.id)
            .execute();

        // Update user status to verified
        await qb
            .updateTable("users")
            .set({
                status: "verified",
                updated_at: sql`NOW()`,
            })
            .where("id", "=", user.userId)
            .execute();

        // Return a new JWT with verified purpose
        const token = signJWT({ userId: user.userId, purpose: "signup-verified" }, 30 * 60);

        return {
            token,
            message: "Email verified successfully.",
        };
    });

// ─── Step 3: Complete Signup ───────────────────────────────────────────────────
const completeSignup = publicProcedure
    .input(
        z.object({
            firstName: z.string().min(1, "First name is required").max(100),
            lastName: z.string().min(1, "Last name is required").max(100),
            password: z.string().min(8, "Password must be at least 8 characters"),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const user = ctx.auth.user;

        if (!user || user.purpose !== "signup-verified") {
            throw new TRPCError({
                code: "UNAUTHORIZED",
                message: "Please verify your email first.",
            });
        }

        const { qb } = ctx.services;

        // Verify user exists and is in verified status
        const dbUser = await qb
            .selectFrom("users")
            .select(["id", "email", "status"])
            .where("id", "=", user.userId)
            .executeTakeFirst();

        if (!dbUser) {
            throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
        }

        if (dbUser.status === "active") {
            throw new TRPCError({
                code: "CONFLICT",
                message: "This account is already active. Please sign in.",
            });
        }

        // Hash password and update user
        const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

        await qb
            .updateTable("users")
            .set({
                first_name: input.firstName,
                last_name: input.lastName,
                password_hash: passwordHash,
                status: "active",
                updated_at: sql`NOW()`,
            })
            .where("id", "=", user.userId)
            .execute();

        // Issue final auth JWT
        const token = signJWT({ userId: dbUser.id, purpose: "auth" }, 7 * 24 * 60 * 60);

        return {
            token,
            user: {
                id: dbUser.id,
                email: dbUser.email,
                name: `${input.firstName} ${input.lastName}`,
            },
        };
    });

// ─── Password Reset 1: Initiate ────────────────────────────────────────────────
const initiatePasswordReset = publicProcedure
    .input(
        z.object({
            email: z.string().email("Please enter a valid email address"),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const { email } = input;
        const { qb } = ctx.services;

        const dbUser = await qb
            .selectFrom("users")
            .select(["id", "status"])
            .where("email", "=", email.toLowerCase())
            .executeTakeFirst();

        if (!dbUser || dbUser.status !== "active") {
            // Silence failures to prevent email enumeration
            return {
                token: null,
                message: "If an active account with that email exists, a verification code has been sent.",
            };
        }

        const userId = dbUser.id;

        // Invalidate old codes
        await qb
            .updateTable("email_verification_codes")
            .set({ used: true })
            .where("user_id", "=", userId)
            .where("used", "=", false)
            .execute();

        const code = generateOTP();
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

        await qb
            .insertInto("email_verification_codes")
            .values({
                id: generateId(),
                user_id: userId,
                code,
                expires_at: expiresAt.toISOString(),
                used: false,
            })
            .execute();

        try {
            await ctx.services.mailer.sendEmail(
                email.toLowerCase(),
                "Your password reset verification code",
                VerificationCodeEmail,
                { code, email: email.toLowerCase() }
            );
            logger.info(`Password reset code sent to ${email}`);
        } catch (error) {
            logger.error(`Failed to send password reset email to ${email}: ${error}`);
        }

        const token = signJWT({ userId, purpose: "password-reset" }, 15 * 60);

        return {
            token,
            message: "If an active account with that email exists, a verification code has been sent.",
        };
    });

// ─── Password Reset 2: Verify Code ─────────────────────────────────────────────
const verifyPasswordResetCode = publicProcedure
    .input(
        z.object({
            code: z.string().length(6, "Code must be 6 digits"),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const user = ctx.auth.user;

        if (!user || user.purpose !== "password-reset") {
            throw new TRPCError({
                code: "UNAUTHORIZED",
                message: "Invalid or expired session. Please start the password reset again.",
            });
        }

        const { qb } = ctx.services;

        const verificationCode = await qb
            .selectFrom("email_verification_codes")
            .select(["id", "code", "expires_at"])
            .where("user_id", "=", user.userId)
            .where("used", "=", false)
            .where("expires_at", ">", new Date())
            .orderBy("created_at", "desc")
            .executeTakeFirst();

        if (!verificationCode || verificationCode.code !== input.code) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Invalid or expired verification code. Please try again.",
            });
        }

        await qb
            .updateTable("email_verification_codes")
            .set({ used: true })
            .where("id", "=", verificationCode.id)
            .execute();

        const token = signJWT({ userId: user.userId, purpose: "password-reset-verified" }, 30 * 60);

        return {
            token,
            message: "Code verified successfully.",
        };
    });

// ─── Password Reset 3: Complete ────────────────────────────────────────────────
const completePasswordReset = publicProcedure
    .input(
        z.object({
            password: z.string().min(8, "Password must be at least 8 characters"),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const user = ctx.auth.user;

        if (!user || user.purpose !== "password-reset-verified") {
            throw new TRPCError({
                code: "UNAUTHORIZED",
                message: "Please verify your email code first.",
            });
        }

        const { qb } = ctx.services;

        const dbUser = await qb
            .selectFrom("users")
            .select(["id", "status"])
            .where("id", "=", user.userId)
            .executeTakeFirst();

        if (!dbUser || dbUser.status !== "active") {
            throw new TRPCError({ code: "NOT_FOUND", message: "User not found or inactive." });
        }

        const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

        await qb
            .updateTable("users")
            .set({
                password_hash: passwordHash,
                updated_at: sql`NOW()`,
            })
            .where("id", "=", user.userId)
            .execute();

        return {
            message: "Password reset complete. You can now log in.",
        };
    });

// ─── Login ───────────────────────────────────────────────────────────────────
const login = publicProcedure
    .input(
        z.object({
            email: z.string().email("Please enter a valid email address"),
            password: z.string().min(1, "Password is required"),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const { email, password } = input;
        const { qb } = ctx.services;

        const dbUser = await qb
            .selectFrom("users")
            .select(["id", "email", "status", "password_hash", "first_name", "last_name"])
            .where("email", "=", email.toLowerCase())
            .executeTakeFirst();

        if (!dbUser) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Invalid email or password.",
            });
        }

        if (dbUser.status !== "active") {
            if (dbUser.status === "pending_verification" || dbUser.status === "verified") {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Please complete your signup process first.",
                });
            }
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "Your account is not active.",
            });
        }

        if (!dbUser.password_hash) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Invalid email or password.",
            });
        }

        const isValidPassword = await bcrypt.compare(password, dbUser.password_hash);
        if (!isValidPassword) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Invalid email or password.",
            });
        }

        const token = signJWT({ userId: dbUser.id, purpose: "auth" }, 7 * 24 * 60 * 60);

        return {
            token,
            user: {
                id: dbUser.id,
                email: dbUser.email,
                name: `${dbUser.first_name || ""} ${dbUser.last_name || ""}`.trim(),
            },
        };
    });

// ─── Export Router ─────────────────────────────────────────────────────────────
export const authRouter = router({
    initiateSignup,
    verifyCode,
    completeSignup,
    resendCode,
    login,
    initiatePasswordReset,
    verifyPasswordResetCode,
    completePasswordReset,
});
