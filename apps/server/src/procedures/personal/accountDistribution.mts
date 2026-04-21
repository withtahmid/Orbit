import { TRPCError } from "@trpc/server";
import type { UserAccounts } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";

/**
 * The caller's personally-owned accounts with current balance. Same
 * shape as analytics.accountDistribution so the existing "accounts"
 * analytics view can render unchanged when the virtual space is active.
 */
export const personalAccountDistribution = authorizedProcedure.query(
    async ({ ctx }) => {
        const [error, rows] = await safeAwait(
            ctx.services.qb
                .selectFrom("accounts")
                .innerJoin("user_accounts", "user_accounts.account_id", "accounts.id")
                .innerJoin(
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
                .execute()
        );
        if (error) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute personal account distribution",
            });
        }
        return (rows ?? []).map((r) => ({
            accountId: r.id,
            name: r.name,
            accountType: r.account_type as unknown as
                | "asset"
                | "liability"
                | "locked",
            color: r.color,
            icon: r.icon,
            balance: Number(r.balance),
        }));
    }
);
