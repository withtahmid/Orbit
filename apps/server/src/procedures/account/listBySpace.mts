import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { TRPCError } from "@trpc/server";

export const listAccountsBySpace = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
        })
    )
    .query(async ({ ctx, input }) => {
        await resolveSpaceMembership({
            trx: ctx.services.qb,
            spaceId: input.spaceId,
            userId: ctx.auth.user.id,
            roles: ["owner", "editor", "viewer"] as unknown as SpaceMembers["role"][],
        });

        const [error, accounts] = await safeAwait(
            ctx.services.qb
                .selectFrom("accounts")
                .innerJoin("space_accounts", "space_accounts.account_id", "accounts.id")
                .innerJoin("user_accounts", (join) =>
                    join
                        .onRef("user_accounts.account_id", "=", "accounts.id")
                        .on("user_accounts.user_id", "=", ctx.auth.user.id)
                )
                .innerJoin(
                    "account_balances",
                    "account_balances.account_id",
                    "accounts.id"
                )
                .where("space_accounts.space_id", "=", input.spaceId)
                .select([
                    "accounts.id",
                    "accounts.name",
                    "accounts.account_type",
                    "accounts.color",
                    "accounts.icon",
                    "account_balances.balance",
                    "user_accounts.role as my_role",
                ])
                .execute()
        );
        if (error) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to fetch accounts for space",
            });
        }
        return (accounts ?? []).map((a) => ({
            id: a.id,
            name: a.name,
            account_type: a.account_type as unknown as "asset" | "liability" | "locked",
            color: a.color,
            icon: a.icon,
            balance: a.balance,
            myRole: a.my_role as unknown as "owner" | "viewer",
        }));
    });
