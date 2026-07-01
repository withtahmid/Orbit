import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { Transactions } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import {
    decodeTransactionCursor,
    encodeTransactionCursor,
} from "../transaction/utils/cursor.mjs";
import {
    computeBalanceAfter,
    computeRowAccountBalances,
} from "../transaction/utils/accountRunningBalance.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

/**
 * Paginated cross-space transaction feed for the virtual personal
 * space. Any transaction touching at least one account the caller owns,
 * in any space the caller is currently a member of.
 *
 * Output shape mirrors transaction.listBySpace exactly (snake_case
 * field names, flat columns for created_by / created_by_* /
 * source_account_id / etc.) so the existing TransactionsPage can
 * render personal.transactions.data.items unchanged. Extra fields
 * specific to the personal view are added alongside:
 *   - `space_id` / `space_name`         — which real space hosts the tx
 *   - `direction`                       — "in" / "out" / "internal"
 *   - `is_internal_transfer`            — owned → owned rebalance
 *
 * Filter parity with transaction.list: type, spaceId,
 * expenseCategoryId (with recursive descendant match),
 * envelopId, eventId, accountId, userId (created_by), search,
 * amountMin/amountMax, dateFrom/dateTo, cursor.
 */
export const personalTransactions = authorizedProcedure
    .input(
        z.object({
            type: z.enum(["income", "expense", "transfer", "adjustment"]).nullish(),
            spaceId: z.string().uuid().nullish(),
            expenseCategoryId: z.string().uuid().nullish(),
            expenseCategoryIds: z.array(z.string().uuid()).nullish(),
            includeDescendants: z.boolean().default(true),
            envelopId: z
                .union([z.string().uuid(), z.literal("__none")])
                .nullish(),
            envelopIds: z.array(z.string().uuid()).nullish(),
            eventId: z.string().uuid().nullish(),
            accountId: z.string().uuid().nullish(),
            accountIds: z.array(z.string().uuid()).nullish(),
            userId: z.string().uuid().nullish(),
            search: z.string().trim().min(1).max(255).nullish(),
            amountMin: z.number().nonnegative().nullish(),
            amountMax: z.number().nonnegative().nullish(),
            dateFrom: z.coerce.date().nullish(),
            dateTo: z.coerce.date().nullish(),
            /* Opaque compound cursor `<isoDate>|<uuid>` — see
               `../transaction/utils/cursor.mts`. */
            cursor: z.string().max(80).nullish(),
            limit: z.number().int().min(1).max(200).default(50),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            (async () => {
                const owned = await resolveOwnedAccountIds(
                    ctx.services.qb,
                    ctx.auth.user.id
                );
                const memberSpaces = await resolveMemberSpaceIds(
                    ctx.services.qb,
                    ctx.auth.user.id
                );
                if (owned.length === 0 || memberSpaces.length === 0) {
                    return { items: [], nextCursor: null as string | null };
                }

                const ownedSet = new Set(owned);

                const spaceFilter: string[] = input.spaceId
                    ? memberSpaces.includes(input.spaceId)
                        ? [input.spaceId]
                        : []
                    : memberSpaces;
                if (spaceFilter.length === 0) {
                    return { items: [], nextCursor: null as string | null };
                }

                // Effective filter lists: plural array wins over the
                // legacy singular param. Account ids are additionally
                // intersected with owned accounts — a non-owned account
                // never participates in the personal feed.
                const requestedAccountIds =
                    input.accountIds && input.accountIds.length > 0
                        ? input.accountIds
                        : input.accountId
                          ? [input.accountId]
                          : null;
                let accountIdFilter: string[] | null = null;
                if (requestedAccountIds) {
                    accountIdFilter = requestedAccountIds.filter((id) =>
                        ownedSet.has(id)
                    );
                    if (accountIdFilter.length === 0) {
                        return { items: [], nextCursor: null as string | null };
                    }
                }
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
                        if (categoryIds.length === 0) {
                            categoryIds = categoryBaseIds;
                        }
                    } else {
                        categoryIds = categoryBaseIds;
                    }
                }

                const rows = await ctx.services.qb
                    .selectFrom("transactions")
                    .leftJoin("users", "users.id", "transactions.created_by")
                    .innerJoin("spaces", "spaces.id", "transactions.space_id")
                    .where("transactions.space_id", "in", spaceFilter)
                    .where((eb) =>
                        eb.or([
                            eb("transactions.source_account_id", "in", owned),
                            eb("transactions.destination_account_id", "in", owned),
                        ])
                    )
                    .$if(!!accountIdFilter, (qb) =>
                        qb.where((eb) =>
                            eb.or([
                                eb(
                                    "transactions.source_account_id",
                                    "in",
                                    accountIdFilter!
                                ),
                                eb(
                                    "transactions.destination_account_id",
                                    "in",
                                    accountIdFilter!
                                ),
                            ])
                        )
                    )
                    .$if(!!input.type, (qb) =>
                        qb.where(
                            "transactions.type",
                            "=",
                            input.type as unknown as Transactions["type"]
                        )
                    )
                    .$if(!!input.userId, (qb) =>
                        qb.where("transactions.created_by", "=", input.userId!)
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
                    .$if(!!input.search, (qb) =>
                        qb.where((eb) =>
                            eb.or([
                                eb("transactions.description", "ilike", `%${input.search}%`),
                                eb("transactions.location", "ilike", `%${input.search}%`),
                            ])
                        )
                    )
                    .$if(input.amountMin !== null && input.amountMin !== undefined, (qb) =>
                        qb.where(
                            "transactions.amount",
                            ">=",
                            input.amountMin as unknown as string
                        )
                    )
                    .$if(input.amountMax !== null && input.amountMax !== undefined, (qb) =>
                        qb.where(
                            "transactions.amount",
                            "<=",
                            input.amountMax as unknown as string
                        )
                    )
                    .$if(!!input.dateFrom, (qb) =>
                        qb.where(
                            "transactions.transaction_datetime",
                            ">=",
                            input.dateFrom!
                        )
                    )
                    .$if(!!input.dateTo, (qb) =>
                        qb.where("transactions.transaction_datetime", "<", input.dateTo!)
                    )
                    .$if(!!input.cursor, (qb) => {
                        const decoded = decodeTransactionCursor(input.cursor!);
                        if (!decoded) return qb;
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
                    .select([
                        "transactions.id",
                        "transactions.space_id",
                        "spaces.name as space_name",
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
                    .orderBy("transactions.transaction_datetime", "desc")
                    .orderBy("transactions.id", "desc")
                    .limit(input.limit + 1)
                    .execute();

                const hasMore = rows.length > input.limit;
                const page = hasMore ? rows.slice(0, input.limit) : rows;
                const nextCursor = hasMore
                    ? encodeTransactionCursor(page[page.length - 1])
                    : null;

                // "Balance after" per owned account touched by each row.
                // Scoped to the member spaces actually listed and to the
                // caller's owned accounts (so a transfer's non-owned leg
                // never leaks a balance). A single owned account collapses
                // to a clean running-balance column.
                const pageIds = page.map((r) => r.id);
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
                    // Only owned accounts get a balance (leak boundary), and
                    // only those actually on this page (bounds the scan).
                    const ownedPageAccounts = [
                        ...new Set(
                            page.flatMap((r) =>
                                [
                                    r.source_account_id,
                                    r.destination_account_id,
                                ].filter(
                                    (a): a is string => !!a && ownedSet.has(a)
                                )
                            )
                        ),
                    ];
                    balanceByTx = await computeRowAccountBalances(
                        ctx.services.qb,
                        pageIds,
                        ownedPageAccounts
                    );
                }

                const items = page.map((r) => {
                    const srcOwned =
                        r.source_account_id != null && ownedSet.has(r.source_account_id);
                    const dstOwned =
                        r.destination_account_id != null &&
                        ownedSet.has(r.destination_account_id);
                    const type = r.type as unknown as
                        | "income"
                        | "expense"
                        | "transfer"
                        | "adjustment";
                    let direction: "in" | "out" | "internal";
                    if (type === "income") direction = dstOwned ? "in" : "out";
                    else if (type === "expense") direction = srcOwned ? "out" : "in";
                    else if (type === "transfer") {
                        if (srcOwned && dstOwned) direction = "internal";
                        else if (srcOwned) direction = "out";
                        else direction = "in";
                    } else direction = dstOwned ? "in" : "out";

                    return {
                        ...r,
                        // personal-view enrichments
                        direction,
                        is_internal_transfer:
                            type === "transfer" && srcOwned && dstOwned,
                        source_is_owned: srcOwned,
                        destination_is_owned: dstOwned,
                        account_balances_after: balanceByTx.get(r.id) ?? {},
                    };
                });

                return { items, nextCursor };
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to list personal transactions",
            });
        }
        return result;
    });
