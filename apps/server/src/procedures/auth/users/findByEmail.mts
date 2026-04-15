import { z } from "zod";
import { authorizedProcedure } from "../../../trpc/middlewares/authorized.mjs";

export const findUserByEmail = authorizedProcedure
    .input(
        z.object({
            email: z.string().email(),
        })
    )
    .output(
        z
            .object({
                id: z.string().uuid(),
                email: z.string().email(),
                first_name: z.string(),
                last_name: z.string(),
                avatar_url: z.string().url().nullable(),
            })
            .nullable()
    )
    .query(async ({ ctx, input }) => {
        const user = await ctx.services.qb
            .selectFrom("users")
            .select(["id", "email", "first_name", "last_name", "avatar_url"])
            .where("email", "=", input.email)
            .executeTakeFirst();

        return user || null;
    });
