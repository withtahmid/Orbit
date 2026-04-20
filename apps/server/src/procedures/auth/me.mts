import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";

export const meProcedure = authorizedProcedure
    .output(
        z.object({
            id: z.string().uuid(),
            email: z.string().email(),
            first_name: z.string(),
            last_name: z.string(),
            avatar_file_id: z.string().nullable(),
        })
    )
    .query(async ({ ctx }) => {
        const user = await ctx.services.qb
            .selectFrom("users")
            .select(["id", "email", "first_name", "last_name", "avatar_file_id"])
            .where("id", "=", ctx.auth.user.id)
            .executeTakeFirst();
        if (!user) {
            throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }
        return user;
    });
