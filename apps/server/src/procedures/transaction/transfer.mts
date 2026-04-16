import { z } from "zod";
import { Transactions } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveTransactionPermission } from "./utils/resolveTransactionPermission.mjs";
import { TRPCError } from "@trpc/server";
import { resolveAvailableBalance } from "./utils/resolveAvailableBalance.mjs";

export const createTransferTransaction = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            amount: z.number().positive(),
            datetime: z.coerce.date().optional(),
            description: z.string().optional(),
            location: z.string().optional(),
            sourceAccountId: z.string().uuid(),
            destinationAccountId: z.string().uuid(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveTransactionPermission({
                    trx,
                    userId: ctx.auth.user.id,
                    destinationAccountId: input.destinationAccountId,
                    sourceAccountId: input.sourceAccountId,
                    type: "transfer" as unknown as Transactions["type"],
                });

                await resolveAvailableBalance({
                    trx,
                    accountId: input.sourceAccountId,
                    requiredBalance: input.amount,
                });

                const transaction = await trx
                    .insertInto("transactions")
                    .values({
                        space_id: input.spaceId,
                        created_by: ctx.auth.user.id,
                        type: "transfer" as unknown as Transactions["type"],
                        amount: input.amount,
                        source_account_id: input.sourceAccountId,
                        destination_account_id: input.destinationAccountId,
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
                message: "Failed to create transfer transaction",
            });
        }

        return result;
    });
