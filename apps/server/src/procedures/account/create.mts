import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { TRPCError } from "@trpc/server";
import { UserAccounts } from "../../db/kysely/types.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const createAccount = authorizedProcedure
    .input(
        z.object({
            space_id: z.string().uuid(),
            name: z.string().min(1).max(255),
        })
    )
    .output(
        z.object({
            id: z.string().uuid(),
            name: z.string(),
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
                    })
                    .returning(["id", "name"])
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

                return account;
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
