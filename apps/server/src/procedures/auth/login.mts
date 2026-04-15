import { TRPCError } from "@trpc/server";
import bcrypt from "bcrypt";
import { z } from "zod";
import { signJWT } from "../../trpc/auth.mjs";
import publicProcedure from "../../trpc/middlewares/public.mjs";
import { logger } from "../../utils/logger.mjs";

export const loginProcedure = publicProcedure
    .input(
        z.object({
            email: z
                .string()
                .email("Please enter a valid email address")
                .transform((email) => email.toLowerCase()),
            password: z.string().min(1, "Password is required"),
        })
    )
    .output(
        z.object({
            token: z.string(),
            user: z.object({
                id: z.string(),
                email: z.string(),
                firstName: z.string(),
                lastName: z.string(),
                avatar_url: z.string().nullable(),
            }),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const { email, password } = input;
        const { qb } = ctx.services;
        logger.debug(input);
        const dbUser = await qb
            .selectFrom("users")
            .select(["id", "email", "password_hash", "first_name", "last_name", "avatar_url"])
            .where("email", "=", email)
            .executeTakeFirst();

        if (!dbUser) {
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

        const token = signJWT({ userId: dbUser.id }, 7 * 24 * 60 * 60);

        return {
            token,
            user: {
                id: dbUser.id,
                email: dbUser.email,
                firstName: dbUser.first_name,
                lastName: dbUser.last_name,
                avatar_url: dbUser.avatar_url,
            },
        };
    });
