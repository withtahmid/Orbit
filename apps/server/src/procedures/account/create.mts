import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { TRPCError } from "@trpc/server";
import type { Accounts, UserAccounts } from "../../db/kysely/types.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

const HEX = /^#[0-9a-fA-F]{6}$/;

export const createAccount = authorizedProcedure
    .input(
        z.object({
            space_id: z.string().uuid(),
            name: z.string().min(1).max(255),
            account_type: z.enum(["asset", "liability", "locked"]),
            color: z.string().regex(HEX).optional(),
            icon: z.string().min(1).max(48).optional(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.space_id,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as UserAccounts["role"][],
                });

                const account = await trx
                    .insertInto("accounts")
                    .values({
                        name: input.name,
                        account_type: input.account_type as unknown as Accounts["account_type"],
                        color: input.color,
                        icon: input.icon,
                    })
                    .returning(["id", "name", "account_type", "color", "icon"])
                    .executeTakeFirstOrThrow();

                await trx
                    .insertInto("user_accounts")
                    .values({
                        account_id: account.id,
                        user_id: ctx.auth.user.id,
                        role: "owner" as unknown as UserAccounts["role"],
                    })
                    .executeTakeFirstOrThrow();
                await trx
                    .insertInto("space_accounts")
                    .values({
                        account_id: account.id,
                        space_id: input.space_id,
                    })
                    .executeTakeFirstOrThrow();

                await trx
                    .insertInto("account_balances")
                    .values({
                        account_id: account.id,
                        balance: 0,
                    })
                    .executeTakeFirstOrThrow();

                return {
                    id: account.id,
                    name: account.name,
                    account_type: account.account_type as unknown as
                        | "asset"
                        | "liability"
                        | "locked",
                    color: account.color,
                    icon: account.icon,
                };
            })
        );
        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to create account",
            });
        }
        return result;
    });
