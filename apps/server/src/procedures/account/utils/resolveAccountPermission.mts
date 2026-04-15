import { Kysely } from "kysely";
import { DB, UserAccounts } from "../../../db/kysely/types.mjs";
import { TRPCError } from "@trpc/server";

export const resolveAccountPermission = async ({
    trx,
    accountId,
    userId,
    roles,
}: {
    trx: Kysely<DB>;
    accountId: string;
    userId: string;
    roles: UserAccounts["role"][];
}) => {
    const account = await trx
        .selectFrom("accounts")
        .select(["accounts.id"])
        .where("accounts.id", "=", accountId)
        .executeTakeFirst();

    if (!account) {
        throw new TRPCError({
            code: "NOT_FOUND",
            message: "Account not found",
        });
    }
    const membership = await trx
        .selectFrom("user_accounts")
        .select(["user_accounts.user_id", "user_accounts.role"])
        .where("user_accounts.account_id", "=", accountId)
        .where("user_accounts.user_id", "=", userId)
        .where("user_accounts.role", "in", roles)
        .executeTakeFirst();

    if (!membership) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have permission to perform the action on this account",
        });
    }
    return { account, membership };
};
