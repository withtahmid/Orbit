import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { SpaceMembers, Transactions } from "../../db/kysely/types.mjs";
import { TRPCError } from "@trpc/server";

export const listTransactionsBySpace = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            userId: z
                .string()
                .uuid()
                .nullish()
                .transform((val) => val || null),
            type: z
                .enum(["income", "expense", "transfer", "adjustment"])
                .nullish()
                .transform((val) => val || null),
            envelop_id: z
                .string()
                .uuid()
                .nullish()
                .transform((val) => val || null),
            expense_category_id: z
                .string()
                .uuid()
                .nullish()
                .transform((val) => val || null),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor", "viewer"] as unknown as SpaceMembers["role"][],
                });

                const transactions = await trx
                    .selectFrom("transactions")
                    .leftJoin(
                        "expense_categories",
                        "expense_categories.id",
                        "transactions.expense_category_id"
                    )
                    .select([
                        "transactions.id",
                        "transactions.space_id",
                        "transactions.created_by",
                        "transactions.type",
                        "transactions.amount",
                        "transactions.source_account_id",
                        "transactions.destination_account_id",
                        "transactions.description",
                        "transactions.location",
                        "transactions.transaction_datetime",
                        "transactions.created_at",
                        "transactions.expense_category_id",
                    ])
                    .where("transactions.space_id", "=", input.spaceId)
                    .where((eb) =>
                        input.userId
                            ? eb("transactions.created_by", "=", input.userId)
                            : eb.val(true)
                    )
                    .where((eb) =>
                        input.type
                            ? eb(
                                  "transactions.type",
                                  "=",
                                  input.type as unknown as Transactions["type"]
                              )
                            : eb.val(true)
                    )
                    .where((eb) =>
                        input.envelop_id
                            ? eb("expense_categories.envelop_id", "=", input.envelop_id)
                            : eb.val(true)
                    )
                    .where((eb) =>
                        input.expense_category_id
                            ? eb("transactions.expense_category_id", "=", input.expense_category_id)
                            : eb.val(true)
                    )
                    .orderBy("transactions.transaction_datetime", "desc")
                    .execute();
                return transactions;
            })
        );
        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to list transactions",
            });
        }
        return result;
    });
