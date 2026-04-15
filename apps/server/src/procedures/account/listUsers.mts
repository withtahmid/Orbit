import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { TRPCError } from "@trpc/server";

export const listUsersHaveAccessToAccount = authorizedProcedure
    .input(
        z.object({
            accountId: z.string().uuid(),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, users] = await safeAwait(
            ctx.services.qb
                .selectFrom("user_accounts")
                .innerJoin("users", "users.id", "user_accounts.user_id")
                .where("user_accounts.account_id", "=", input.accountId)
                .select([
                    "users.id",
                    "users.first_name",
                    "users.last_name",
                    "users.email",
                    "user_accounts.role",
                ])
                .execute()
        );
        if (error) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to fetch users for account",
            });
        }
        return users;
    });
