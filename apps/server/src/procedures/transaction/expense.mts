import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { Transactions } from "../../db/kysely/types.mjs";
import { resolveTransactionPermission } from "./utils/resolveTransactionPermission.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { TRPCError } from "@trpc/server";
import { resolveExpenseCategoryBelongsToSpace } from "../expenseCategory/utils/resolveExpenseCategoryBelongsToSpace.mjs";
import { resolveAvailableBalance } from "./utils/resolveAvailableBalance.mjs";

export const createExpenseTransaction = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            amount: z.number().positive(),
            datetime: z.coerce.date().optional(),
            description: z.string().optional(),
            location: z.string().optional(),
            sourceAccountId: z.string().uuid(),
            expense_category_id: z.string().uuid(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveTransactionPermission({
                    trx,
                    userId: ctx.auth.user.id,
                    destinationAccountId: null,
                    sourceAccountId: input.sourceAccountId,
                    type: "expense" as unknown as Transactions["type"],
                });
                await resolveExpenseCategoryBelongsToSpace({
                    trx,
                    expenseCategoryId: input.expense_category_id,
                    spaceId: input.spaceId,
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
                        type: "expense" as unknown as Transactions["type"],
                        amount: input.amount,
                        source_account_id: input.sourceAccountId,
                        destination_account_id: null,
                        expense_category_id: input.expense_category_id,
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
                message: "Failed to create expense transaction",
            });
        }

        return result;
    });
