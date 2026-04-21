import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { resolveTransactionPermission } from "./utils/resolveTransactionPermission.mjs";
import { resolveAvailableBalance } from "./utils/resolveAvailableBalance.mjs";
import { resolveEventBelongsToSpace } from "../event/utils/resolveEventBelongsToSpace.mjs";
import { resolveExpenseCategoryBelongsToSpace } from "../expenseCategory/utils/resolveExpenseCategoryBelongsToSpace.mjs";
import type { SpaceMembers, Transactions } from "../../db/kysely/types.mjs";
import { attachFilesToTransaction } from "../file/attach.mjs";

export const updateTransaction = authorizedProcedure
    .input(
        z.object({
            transactionId: z.string().uuid(),
            amount: z.number().positive().optional(),
            datetime: z.coerce.date().optional(),
            description: z.string().nullable().optional(),
            location: z.string().nullable().optional(),
            sourceAccountId: z.string().uuid().nullable().optional(),
            destinationAccountId: z.string().uuid().nullable().optional(),
            expenseCategoryId: z.string().uuid().nullable().optional(),
            eventId: z.string().uuid().nullable().optional(),
            addAttachmentFileIds: z.array(z.string().uuid()).max(10).optional(),
            // Fee fields only valid on transfers; pass `null` for both
            // to clear. Both must move together (CHECK enforces).
            feeAmount: z.number().positive().nullable().optional(),
            feeExpenseCategoryId: z.string().uuid().nullable().optional(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const existing = await trx
                    .selectFrom("transactions")
                    .selectAll()
                    .where("id", "=", input.transactionId)
                    .executeTakeFirst();
                if (!existing) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Transaction not found",
                    });
                }

                const isCreator = existing.created_by === ctx.auth.user.id;
                if (!isCreator) {
                    await resolveSpaceMembership({
                        trx,
                        spaceId: existing.space_id,
                        userId: ctx.auth.user.id,
                        roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                    });
                }

                const merged = {
                    amount: input.amount ?? Number(existing.amount),
                    datetime: input.datetime ?? existing.transaction_datetime,
                    description:
                        input.description === undefined
                            ? existing.description
                            : input.description,
                    location:
                        input.location === undefined ? existing.location : input.location,
                    sourceAccountId:
                        input.sourceAccountId === undefined
                            ? existing.source_account_id
                            : input.sourceAccountId,
                    destinationAccountId:
                        input.destinationAccountId === undefined
                            ? existing.destination_account_id
                            : input.destinationAccountId,
                    expenseCategoryId:
                        input.expenseCategoryId === undefined
                            ? existing.expense_category_id
                            : input.expenseCategoryId,
                    eventId:
                        input.eventId === undefined ? existing.event_id : input.eventId,
                    feeAmount:
                        input.feeAmount === undefined
                            ? existing.fee_amount === null
                                ? null
                                : Number(existing.fee_amount)
                            : input.feeAmount,
                    feeExpenseCategoryId:
                        input.feeExpenseCategoryId === undefined
                            ? existing.fee_expense_category_id
                            : input.feeExpenseCategoryId,
                };

                // Fee fields must move together. Rejecting here gives a
                // cleaner error than letting the DB CHECK raise.
                if (
                    (merged.feeAmount === null) !==
                    (merged.feeExpenseCategoryId === null)
                ) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Fee amount and fee category must both be set or both cleared",
                    });
                }
                const isTransfer =
                    (existing.type as unknown as string) === "transfer";
                if (!isTransfer && merged.feeAmount !== null) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Fees are only valid on transfer transactions",
                    });
                }

                if (merged.feeExpenseCategoryId) {
                    await resolveExpenseCategoryBelongsToSpace({
                        trx,
                        expenseCategoryId: merged.feeExpenseCategoryId,
                        spaceId: existing.space_id,
                    });
                }

                await resolveTransactionPermission({
                    trx,
                    userId: ctx.auth.user.id,
                    sourceAccountId: merged.sourceAccountId,
                    destinationAccountId: merged.destinationAccountId,
                    type: existing.type as unknown as Transactions["type"],
                });

                if (merged.expenseCategoryId) {
                    await resolveExpenseCategoryBelongsToSpace({
                        trx,
                        expenseCategoryId: merged.expenseCategoryId,
                        spaceId: existing.space_id,
                    });
                }

                if (merged.eventId) {
                    await resolveEventBelongsToSpace({
                        trx,
                        eventId: merged.eventId,
                        spaceId: existing.space_id,
                    });
                }

                if (merged.sourceAccountId) {
                    // Validate balance if amount+fee increased or source
                    // changed. Account for fee too since transfers with
                    // fees debit the source by amount + fee.
                    const newTotalOut =
                        merged.amount + Number(merged.feeAmount ?? 0);
                    const previousTotalOutOnSource =
                        existing.source_account_id === merged.sourceAccountId
                            ? Number(existing.amount) +
                              Number(existing.fee_amount ?? 0)
                            : 0;
                    const required = Math.max(
                        0,
                        newTotalOut - previousTotalOutOnSource
                    );
                    if (required > 0) {
                        await resolveAvailableBalance({
                            trx,
                            accountId: merged.sourceAccountId,
                            requiredBalance: required,
                        });
                    }
                }

                await trx
                    .updateTable("transactions")
                    .set({
                        amount: merged.amount,
                        transaction_datetime: merged.datetime,
                        description: merged.description,
                        location: merged.location,
                        source_account_id: merged.sourceAccountId,
                        destination_account_id: merged.destinationAccountId,
                        expense_category_id: merged.expenseCategoryId,
                        event_id: merged.eventId,
                        fee_amount: merged.feeAmount,
                        fee_expense_category_id: merged.feeExpenseCategoryId,
                    })
                    .where("id", "=", input.transactionId)
                    .execute();

                await attachFilesToTransaction({
                    trx,
                    transactionId: input.transactionId,
                    fileIds: input.addAttachmentFileIds ?? [],
                    userId: ctx.auth.user.id,
                });

                return { id: input.transactionId };
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to update transaction",
            });
        }
        return result;
    });
