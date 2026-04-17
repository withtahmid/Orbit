import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const accountDistribution = authorizedProcedure
    .input(z.object({ spaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor", "viewer"] as unknown as SpaceMembers["role"][],
                });

                const rows = await trx
                    .selectFrom("accounts")
                    .innerJoin("space_accounts", "space_accounts.account_id", "accounts.id")
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
                    ])
                    .execute();

                return rows.map((r) => ({
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
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute account distribution",
            });
        }
        return result;
    });
