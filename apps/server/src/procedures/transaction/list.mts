import { z } from "zod";
import { sql } from "kysely";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import type { SpaceMembers, Transactions } from "../../db/kysely/types.mjs";
import { TRPCError } from "@trpc/server";
import {
    decodeTransactionCursor,
    encodeTransactionCursor,
} from "./utils/cursor.mjs";
import {
    computeBalanceAfter,
    computeRowAccountBalances,
} from "./utils/accountRunningBalance.mjs";

export const listTransactionsBySpace = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            userId: z.string().uuid().nullish(),
            type: z.enum(["income", "expense", "transfer", "adjustment"]).nullish(),
            /* `__none` sentinel surfaces "No envelope" as a pickable
               filter alongside "Any envelope" (null/undefined) and the
               normal uuid case. The UI maps the picker's `__none` item
               here and the where clause branches to IS NULL below. */
            envelopId: z
                .union([z.string().uuid(), z.literal("__none")])
                .nullish(),
            /** Multi-select envelope filter (matches any id in the set).
                Takes precedence over the singular `envelopId` when non-empty. */
            envelopIds: z.array(z.string().uuid()).nullish(),
            expenseCategoryId: z.string().uuid().nullish(),
            /** Multi-select category filter. Takes precedence over the
                singular `expenseCategoryId` when non-empty; descendants of
                every selected id are matched when `includeDescendants`. */
            expenseCategoryIds: z.array(z.string().uuid()).nullish(),
            /** If true (default), a category filter matches descendants too. */
            includeDescendants: z.boolean().default(true),
            eventId: z.string().uuid().nullish(),
            accountId: z.string().uuid().nullish(),
            /** Multi-select account filter (source OR destination in the
                set). Takes precedence over the singular `accountId`. */
            accountIds: z.array(z.string().uuid()).nullish(),
            search: z.string().trim().min(1).max(255).nullish(),
            amountMin: z.number().nonnegative().nullish(),
            amountMax: z.number().nonnegative().nullish(),
            dateFrom: z.coerce.date().nullish(),
            dateTo: z.coerce.date().nullish(),
            /* Opaque compound cursor `<isoDate>|<uuid>` — see
               `./utils/cursor.mts`. */
            cursor: z.string().max(80).nullish(),
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

                // Effective filter lists: plural array wins over the
                // legacy singular param, so old single-value callers
                // (AccountDetail, EventDetail, deep-links) keep working.
                const accountIdFilter =
                    input.accountIds && input.accountIds.length > 0
                        ? input.accountIds
                        : input.accountId
                          ? [input.accountId]
                          : null;
                const envelopIdFilter =
                    input.envelopIds && input.envelopIds.length > 0
                        ? input.envelopIds
                        : input.envelopId && input.envelopId !== "__none"
                          ? [input.envelopId]
                          : null;
                const categoryBaseIds =
                    input.expenseCategoryIds &&
                    input.expenseCategoryIds.length > 0
                        ? input.expenseCategoryIds
                        : input.expenseCategoryId
                          ? [input.expenseCategoryId]
                          : null;

                // Resolve descendant category IDs if needed
                let categoryIds: string[] | null = null;
                if (categoryBaseIds) {
                    if (input.includeDescendants) {
                        const res = await sql<{ id: string }>`
                            WITH RECURSIVE subtree AS (
                                SELECT id FROM expense_categories
                                WHERE id = ANY(${categoryBaseIds})
                                UNION ALL
                                SELECT ec.id FROM expense_categories ec
                                JOIN subtree s ON ec.parent_id = s.id
                            )
                            SELECT DISTINCT id::text FROM subtree
                        `.execute(ctx.services.qb);
                        categoryIds = res.rows.map((r) => r.id);
                        if (categoryIds.length === 0) categoryIds = categoryBaseIds;
                    } else {
                        categoryIds = categoryBaseIds;
                    }
                }

                const rows = await ctx.services.qb
                    .selectFrom("transactions")
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
                        "transactions.envelop_id",
                        "transactions.event_id",
                        "transactions.parent_transfer_id",
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
                    .$if(!envelopIdFilter && input.envelopId === "__none", (qb) =>
                        qb.where("transactions.envelop_id", "is", null)
                    )
                    .$if(!!envelopIdFilter, (qb) =>
                        qb.where(
                            "transactions.envelop_id",
                            "in",
                            envelopIdFilter!
                        )
                    )
                    .$if(!!categoryIds, (qb) =>
                        qb.where("transactions.expense_category_id", "in", categoryIds!)
                    )
                    .$if(!!input.eventId, (qb) =>
                        qb.where("transactions.event_id", "=", input.eventId!)
                    )
                    .$if(!!accountIdFilter, (qb) =>
                        qb.where((eb) =>
                            eb.or([
                                eb("transactions.source_account_id", "in", accountIdFilter!),
                                eb("transactions.destination_account_id", "in", accountIdFilter!),
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
                    .$if(!!input.cursor, (qb) => {
                        const decoded = decodeTransactionCursor(input.cursor!);
                        if (!decoded) return qb;
                        /* Keyset on (transaction_datetime, id):
                           rows strictly before the cursor in the
                           DESC, DESC order. */
                        return qb.where((eb) =>
                            eb.or([
                                eb(
                                    "transactions.transaction_datetime",
                                    "<",
                                    decoded.dt
                                ),
                                eb.and([
                                    eb(
                                        "transactions.transaction_datetime",
                                        "=",
                                        decoded.dt
                                    ),
                                    eb("transactions.id", "<", decoded.id),
                                ]),
                            ])
                        );
                    })
                    .orderBy("transactions.transaction_datetime", "desc")
                    .orderBy("transactions.id", "desc")
                    .limit(input.limit + 1)
                    .execute();

                const hasMore = rows.length > input.limit;
                const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
                const nextCursor = hasMore
                    ? encodeTransactionCursor(pageRows[pageRows.length - 1])
                    : null;

                // "Balance after" per account touched by each row. A single
                // selected account collapses to a clean running-balance
                // column (cheaper single-account scan); otherwise every row
                // carries the balance of the account(s) it moved — one for
                // income/expense/adjustment, two for a transfer.
                const pageIds = pageRows.map((r) => r.id);
                let balanceByTx: Map<string, Record<string, string>>;
                if (accountIdFilter && accountIdFilter.length === 1) {
                    const single = await computeBalanceAfter(
                        ctx.services.qb,
                        accountIdFilter[0],
                        pageIds
                    );
                    balanceByTx = new Map();
                    for (const [txId, bal] of single) {
                        balanceByTx.set(txId, { [accountIdFilter[0]]: bal });
                    }
                } else {
                    const pageAccountIds = [
                        ...new Set(
                            pageRows.flatMap((r) =>
                                [
                                    r.source_account_id,
                                    r.destination_account_id,
                                ].filter((a): a is string => !!a)
                            )
                        ),
                    ];
                    balanceByTx = await computeRowAccountBalances(
                        ctx.services.qb,
                        pageIds,
                        pageAccountIds
                    );
                }
                const items = pageRows.map((r) => ({
                    ...r,
                    account_balances_after: balanceByTx.get(r.id) ?? {},
                }));

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
