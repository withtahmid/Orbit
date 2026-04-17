import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";

/**
 * All accounts the caller has access to, across every space. Each row
 * carries the caller's role, balance, and the list of spaces the account
 * is shared with *that the caller is also a member of*. Spaces the account
 * is shared into but which the caller is not a member of are aggregated
 * into an opaque `otherSpacesCount` — this prevents leaking the existence
 * or name of a non-member space via the account's sharing list.
 *
 * Powers the global "My Accounts" page outside any space.
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

            // Only surface spaces the caller is a member of. A cross-space
            // account may be visible to the caller globally (via
            // user_accounts) while still being shared into spaces they
            // don't belong to — those spaces must remain hidden.
            const memberSpacesRows = await ctx.services.qb
                .selectFrom("space_accounts")
                .innerJoin("spaces", "spaces.id", "space_accounts.space_id")
                .innerJoin("space_members", (j) =>
                    j
                        .onRef("space_members.space_id", "=", "space_accounts.space_id")
                        .on("space_members.user_id", "=", ctx.auth.user.id)
                )
                .where("space_accounts.account_id", "in", ids)
                .select([
                    "space_accounts.account_id",
                    "spaces.id as space_id",
                    "spaces.name as space_name",
                ])
                .orderBy("spaces.name", "asc")
                .execute();

            // Count all spaces the account is in (to compute the
            // non-member diff without naming them).
            const allSpacesCountRows = await ctx.services.qb
                .selectFrom("space_accounts")
                .where("account_id", "in", ids)
                .select(({ fn }) => [
                    "account_id",
                    fn.countAll<string>().as("total"),
                ])
                .groupBy("account_id")
                .execute();

            const visibleByAccount = new Map<
                string,
                Array<{ spaceId: string; name: string }>
            >();
            for (const r of memberSpacesRows) {
                const arr = visibleByAccount.get(r.account_id) ?? [];
                arr.push({ spaceId: r.space_id, name: r.space_name });
                visibleByAccount.set(r.account_id, arr);
            }
            const totalByAccount = new Map<string, number>();
            for (const r of allSpacesCountRows) {
                totalByAccount.set(r.account_id, Number(r.total));
            }

            return base.map((a) => {
                const visible = visibleByAccount.get(a.id) ?? [];
                const total = totalByAccount.get(a.id) ?? 0;
                const otherSpacesCount = Math.max(0, total - visible.length);
                return {
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
                    spaces: visible,
                    otherSpacesCount,
                };
            });
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
