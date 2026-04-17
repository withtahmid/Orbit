import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";

/**
 * All accounts the caller has access to, across every space. Each row
 * carries the caller's role, balance, and the list of spaces the account
 * is shared with. Powers the global "My Accounts" page outside any space.
 */
export const listAccountsByUser = authorizedProcedure.query(async ({ ctx }) => {
    const [error, rows] = await safeAwait(
        (async () => {
            const base = await ctx.services.qb
                .selectFrom("accounts")
                .innerJoin("user_accounts", "user_accounts.account_id", "accounts.id")
                .leftJoin(
                    "account_balances",
                    "account_balances.account_id",
                    "accounts.id"
                )
                .where("user_accounts.user_id", "=", ctx.auth.user.id)
                .select([
                    "accounts.id",
                    "accounts.name",
                    "accounts.account_type",
                    "accounts.color",
                    "accounts.icon",
                    "account_balances.balance",
                    "user_accounts.role as my_role",
                ])
                .orderBy("accounts.name", "asc")
                .execute();

            if (base.length === 0) return [];

            const ids = base.map((a) => a.id);
            const spacesRows = await ctx.services.qb
                .selectFrom("space_accounts")
                .innerJoin("spaces", "spaces.id", "space_accounts.space_id")
                .where("space_accounts.account_id", "in", ids)
                .select([
                    "space_accounts.account_id",
                    "spaces.id as space_id",
                    "spaces.name as space_name",
                ])
                .orderBy("spaces.name", "asc")
                .execute();

            const spacesByAccount = new Map<
                string,
                Array<{ spaceId: string; name: string }>
            >();
            for (const r of spacesRows) {
                const arr = spacesByAccount.get(r.account_id) ?? [];
                arr.push({ spaceId: r.space_id, name: r.space_name });
                spacesByAccount.set(r.account_id, arr);
            }

            return base.map((a) => ({
                id: a.id,
                name: a.name,
                accountType: a.account_type as unknown as
                    | "asset"
                    | "liability"
                    | "locked",
                color: a.color,
                icon: a.icon,
                balance: Number(a.balance ?? 0),
                myRole: a.my_role as unknown as "owner" | "viewer",
                spaces: spacesByAccount.get(a.id) ?? [],
            }));
        })()
    );

    if (error) {
        throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message || "Failed to fetch accounts for user",
        });
    }
    return rows ?? [];
});
