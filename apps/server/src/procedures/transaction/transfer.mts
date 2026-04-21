import { z } from "zod";
import type { Transactions } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveTransactionPermission } from "./utils/resolveTransactionPermission.mjs";
import { TRPCError } from "@trpc/server";
import { resolveAvailableBalance } from "./utils/resolveAvailableBalance.mjs";
import { resolveEventBelongsToSpace } from "../event/utils/resolveEventBelongsToSpace.mjs";
import { resolveExpenseCategoryBelongsToSpace } from "../expenseCategory/utils/resolveExpenseCategoryBelongsToSpace.mjs";
import { attachFilesToTransaction } from "../file/attach.mjs";

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
            eventId: z.string().uuid().optional(),
            attachmentFileIds: z.array(z.string().uuid()).max(10).optional(),
            // Optional transfer fee: a positive amount deducted from
            // source on top of `amount`, categorized as an expense so it
            // flows through the category/envelope analytics. Both
            // fields move together; DB CHECK enforces this.
            feeAmount: z.number().positive().optional(),
            feeExpenseCategoryId: z.string().uuid().optional(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        // Both or neither of the fee fields — client-side guard mirrors
        // the CHECK constraint.
        if (
            (input.feeAmount !== undefined) !==
            (input.feeExpenseCategoryId !== undefined)
        ) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Fee amount and fee category must both be provided",
            });
        }

        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveTransactionPermission({
                    trx,
                    userId: ctx.auth.user.id,
                    destinationAccountId: input.destinationAccountId,
                    sourceAccountId: input.sourceAccountId,
                    type: "transfer" as unknown as Transactions["type"],
                });

                if (input.eventId) {
                    await resolveEventBelongsToSpace({
                        trx,
                        eventId: input.eventId,
                        spaceId: input.spaceId,
                    });
                }

                if (input.feeExpenseCategoryId) {
                    await resolveExpenseCategoryBelongsToSpace({
                        trx,
                        expenseCategoryId: input.feeExpenseCategoryId,
                        spaceId: input.spaceId,
                    });
                }

                // Source must cover amount + fee. Passing the sum keeps
                // the existing balance guard honest.
                const totalOut = input.amount + (input.feeAmount ?? 0);
                await resolveAvailableBalance({
                    trx,
                    accountId: input.sourceAccountId,
                    requiredBalance: totalOut,
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
                        event_id: input.eventId ?? null,
                        fee_amount: input.feeAmount ?? null,
                        fee_expense_category_id:
                            input.feeExpenseCategoryId ?? null,
                    })
                    .returning(["id"])
                    .executeTakeFirstOrThrow();

                await attachFilesToTransaction({
                    trx,
                    transactionId: transaction.id,
                    fileIds: input.attachmentFileIds ?? [],
                    userId: ctx.auth.user.id,
                });

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
