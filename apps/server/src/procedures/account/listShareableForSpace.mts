import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers, UserAccounts } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Accounts the caller owns that could be added to the given space.
 * Excludes accounts already shared there. Used by the "Add existing account"
 * flow on the space Accounts page.
 */
export const listAccountsShareableForSpace = authorizedProcedure
    .input(z.object({ spaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            (async () => {
                await resolveSpaceMembership({
                    trx: ctx.services.qb,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                });

                return ctx.services.qb
                    .selectFrom("accounts")
                    .innerJoin("user_accounts", (j) =>
                        j
                            .onRef("user_accounts.account_id", "=", "accounts.id")
                            .on("user_accounts.user_id", "=", ctx.auth.user.id)
                            .on(
                                "user_accounts.role",
                                "=",
                                "owner" as unknown as UserAccounts["role"]
                            )
                    )
                    .leftJoin(
                        "account_balances",
                        "account_balances.account_id",
                        "accounts.id"
                    )
                    .where(({ not, exists, selectFrom }) =>
                        not(
                            exists(
                                selectFrom("space_accounts")
                                    .whereRef(
                                        "space_accounts.account_id",
                                        "=",
                                        "accounts.id"
                                    )
                                    .where("space_accounts.space_id", "=", input.spaceId)
                            )
                        )
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
                    .execute();
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to list shareable accounts",
            });
        }
        return (result ?? []).map((a) => ({
            id: a.id,
            name: a.name,
            accountType: a.account_type as unknown as "asset" | "liability" | "locked",
            color: a.color,
            icon: a.icon,
            balance: Number(a.balance ?? 0),
        }));
    });
