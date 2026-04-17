import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveTransactionPermission } from "./utils/resolveTransactionPermission.mjs";
import type { Transactions } from "../../db/kysely/types.mjs";
import { TRPCError } from "@trpc/server";

export const adjustAccountBalance = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            accountId: z.string().uuid(),
            newBalance: z.number(),
            datetime: z.coerce.date().optional(),
            description: z.string().optional(),
            location: z.string().optional(),
        })
    )

    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveTransactionPermission({
                    trx,
                    userId: ctx.auth.user.id,
                    destinationAccountId: input.accountId,
                    sourceAccountId: input.accountId,
                    type: "adjustment" as unknown as Transactions["type"],
                });

                const currentBalance = await trx
                    .selectFrom("account_balances")
                    .select("balance")
                    .where("account_id", "=", input.accountId)
                    .executeTakeFirstOrThrow();

                const adjustmentAmount = input.newBalance - parseFloat(currentBalance.balance);

                if (adjustmentAmount === 0) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "New balance is equal to current balance",
                    });
                }

                const transaction = await trx
                    .insertInto("transactions")
                    .values({
                        space_id: input.spaceId,
                        created_by: ctx.auth.user.id,
                        type: "adjustment" as unknown as Transactions["type"],
                        amount: Math.abs(adjustmentAmount),
                        source_account_id: adjustmentAmount < 0 ? input.accountId : null,
                        destination_account_id: adjustmentAmount > 0 ? input.accountId : null,
                        description: input.description || null,
                        location: input.location || null,
                        transaction_datetime: input.datetime || new Date(),
                    })
                    .returning(["id"])
                    .executeTakeFirstOrThrow();

                return transaction;
            })
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to adjust account balance",
            });
        }

        return result;
    });
