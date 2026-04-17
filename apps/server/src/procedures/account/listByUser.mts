import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";

export const listAccountsByUser = authorizedProcedure.query(async ({ ctx }) => {
    const [error, accounts] = await safeAwait(
        ctx.services.qb
            .selectFrom("accounts")
            .leftJoin("user_accounts", "accounts.id", "user_accounts.account_id")
            .where("user_accounts.user_id", "=", ctx.auth.user.id)
            .select(["accounts.id", "accounts.name"])
            .execute()
    );
    if (error) {
        throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message || "Failed to fetch accounts for user",
        });
    }
    return accounts;
});
