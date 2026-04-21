import { z } from "zod";
import { sql } from "kysely";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import type { SpaceMembers, Transactions } from "../../db/kysely/types.mjs";
import { TRPCError } from "@trpc/server";

export const listTransactionsBySpace = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            userId: z.string().uuid().nullish(),
            type: z.enum(["income", "expense", "transfer", "adjustment"]).nullish(),
            envelopId: z.string().uuid().nullish(),
            expenseCategoryId: z.string().uuid().nullish(),
            /** If true (default), a category filter matches descendants too. */
            includeDescendants: z.boolean().default(true),
            eventId: z.string().uuid().nullish(),
            accountId: z.string().uuid().nullish(),
            search: z.string().trim().min(1).max(255).nullish(),
            amountMin: z.number().nonnegative().nullish(),
            amountMax: z.number().nonnegative().nullish(),
            dateFrom: z.coerce.date().nullish(),
            dateTo: z.coerce.date().nullish(),
            cursor: z.string().uuid().nullish(),
            limit: z.number().int().min(1).max(200).default(50),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            (async () => {
                await resolveSpaceMembership({
                    trx: ctx.services.qb,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor", "viewer"] as unknown as SpaceMembers["role"][],
                });

                // Resolve descendant category IDs if needed
                let categoryIds: string[] | null = null;
                if (input.expenseCategoryId) {
                    if (input.includeDescendants) {
                        const res = await sql<{ id: string }>`
                            WITH RECURSIVE subtree AS (
                                SELECT id FROM expense_categories
                                WHERE id = ${input.expenseCategoryId}
                                UNION ALL
                                SELECT ec.id FROM expense_categories ec
                                JOIN subtree s ON ec.parent_id = s.id
                            )
                            SELECT id::text FROM subtree
                        `.execute(ctx.services.qb);
                        categoryIds = res.rows.map((r) => r.id);
                        if (categoryIds.length === 0) categoryIds = [input.expenseCategoryId];
                    } else {
                        categoryIds = [input.expenseCategoryId];
                    }
                }

                const rows = await ctx.services.qb
                    .selectFrom("transactions")
                    .leftJoin(
                        "expense_categories",
                        "expense_categories.id",
                        "transactions.expense_category_id"
                    )
                    .leftJoin("users", "users.id", "transactions.created_by")
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
                        "transactions.event_id",
                        "transactions.fee_amount",
                        "transactions.fee_expense_category_id",
                        "users.first_name as created_by_first_name",
                        "users.last_name as created_by_last_name",
                        "users.avatar_file_id as created_by_avatar_file_id",
                    ])
                    .where("transactions.space_id", "=", input.spaceId)
                    .$if(!!input.userId, (qb) =>
                        qb.where("transactions.created_by", "=", input.userId!)
                    )
                    .$if(!!input.type, (qb) =>
                        qb.where(
                            "transactions.type",
                            "=",
                            input.type as unknown as Transactions["type"]
                        )
                    )
                    .$if(!!input.envelopId, (qb) =>
                        qb.where("expense_categories.envelop_id", "=", input.envelopId!)
                    )
                    .$if(!!categoryIds, (qb) =>
                        qb.where("transactions.expense_category_id", "in", categoryIds!)
                    )
                    .$if(!!input.eventId, (qb) =>
                        qb.where("transactions.event_id", "=", input.eventId!)
                    )
                    .$if(!!input.accountId, (qb) =>
                        qb.where((eb) =>
                            eb.or([
                                eb("transactions.source_account_id", "=", input.accountId!),
                                eb("transactions.destination_account_id", "=", input.accountId!),
                            ])
                        )
                    )
                    .$if(!!input.search, (qb) =>
                        qb.where((eb) =>
                            eb.or([
                                eb("transactions.description", "ilike", `%${input.search}%`),
                                eb("transactions.location", "ilike", `%${input.search}%`),
                            ])
                        )
                    )
                    .$if(input.amountMin !== null && input.amountMin !== undefined, (qb) =>
                        qb.where("transactions.amount", ">=", input.amountMin as unknown as string)
                    )
                    .$if(input.amountMax !== null && input.amountMax !== undefined, (qb) =>
                        qb.where("transactions.amount", "<=", input.amountMax as unknown as string)
                    )
                    .$if(!!input.dateFrom, (qb) =>
                        qb.where("transactions.transaction_datetime", ">=", input.dateFrom!)
                    )
                    .$if(!!input.dateTo, (qb) =>
                        qb.where("transactions.transaction_datetime", "<", input.dateTo!)
                    )
                    .$if(!!input.cursor, (qb) => qb.where("transactions.id", "<", input.cursor!))
                    .orderBy("transactions.id", "desc")
                    .limit(input.limit + 1)
                    .execute();

                const hasMore = rows.length > input.limit;
                const items = hasMore ? rows.slice(0, input.limit) : rows;
                const nextCursor = hasMore ? items[items.length - 1].id : null;

                return { items, nextCursor };
            })()
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
