import { TRPCError } from "@trpc/server";
import type { UserAccounts } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";

/**
 * Accounts the caller personally owns with their current balance. The
 * /me dashboard uses this to list the assets/liabilities/locked
 * partitions that back the net-worth number. Distinct from
 * account.listByUser (which also returns accounts shared with the user
 * as viewer, plus the spaces each is shared into) — this one is a
 * simpler cut tailored to the personal view.
 */
export const personalOwnedAccounts = authorizedProcedure.query(async ({ ctx }) => {
    const [error, rows] = await safeAwait(
        ctx.services.qb
            .selectFrom("accounts")
            .innerJoin("user_accounts", "user_accounts.account_id", "accounts.id")
            .leftJoin(
                "account_balances",
                "account_balances.account_id",
                "accounts.id"
            )
            .where("user_accounts.user_id", "=", ctx.auth.user.id)
            .where(
                "user_accounts.role",
                "=",
                "owner" as unknown as UserAccounts["role"]
            )
            .select([
                "accounts.id",
                "accounts.name",
                "accounts.account_type",
                "accounts.color",
                "accounts.icon",
                "account_balances.balance",
            ])
            .orderBy("accounts.name", "asc")
            .execute()
    );

    if (error) {
        throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message || "Failed to list owned accounts",
        });
    }

    return (rows ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        accountType: a.account_type as unknown as
            | "asset"
            | "liability"
            | "locked",
        color: a.color,
        icon: a.icon,
        balance: Number(a.balance ?? 0),
    }));
});
