import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { Transactions } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

/**
 * Cross-space personal twin of `transaction.filteredTotals`. Same filter
 * shape as `personal.transactions`: scoped to owned-account participation
 * across every space the caller is currently a member of.
 *
 * IN = inflows to owned accounts; OUT = outflows from owned accounts
 * plus fees on owned-account transfers. Internal owned→owned transfers
 * net to zero (each leg cancels) but their fees still count as outflow.
 */
export const personalTransactionFilteredTotals = authorizedProcedure
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
                const empty = {
                    inTotal: 0,
                    outTotal: 0,
                    net: 0,
                    count: 0,
                    avgPerDay: 0,
                    days: 1,
                };
                if (owned.length === 0 || memberSpaces.length === 0) return empty;

                const spaceFilter: string[] = input.spaceId
                    ? memberSpaces.includes(input.spaceId)
                        ? [input.spaceId]
                        : []
                    : memberSpaces;
                if (spaceFilter.length === 0) return empty;

                const ownedSet = new Set(owned);

                // Effective filter lists: plural array wins over the legacy
                // singular param. Account ids intersect with owned accounts.
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
                    if (accountIdFilter.length === 0) return empty;
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
                        if (categoryIds.length === 0)
                            categoryIds = categoryBaseIds;
                    } else {
                        categoryIds = categoryBaseIds;
                    }
                }

                const row = await sql<{
                    in_total: string;
                    out_total: string;
                    count: string;
                }>`
                    SELECT
                        COALESCE(SUM(CASE
                            WHEN t.type = 'income'
                                AND t.destination_account_id = ANY(${owned}) THEN t.amount
                            WHEN t.type = 'transfer'
                                AND t.destination_account_id = ANY(${owned})
                                AND t.source_account_id <> ALL(${owned}) THEN t.amount
                            WHEN t.type = 'adjustment'
                                AND t.destination_account_id = ANY(${owned}) THEN t.amount
                            ELSE 0
                        END), 0)::text AS in_total,
                        COALESCE(SUM(
                            CASE
                                WHEN t.type = 'expense'
                                    AND t.source_account_id = ANY(${owned}) THEN t.amount
                                WHEN t.type = 'transfer'
                                    AND t.source_account_id = ANY(${owned})
                                    AND t.destination_account_id <> ALL(${owned}) THEN t.amount
                                WHEN t.type = 'adjustment'
                                    AND t.source_account_id = ANY(${owned}) THEN t.amount
                                ELSE 0
                            END
                        ), 0)::text AS out_total,
                        COUNT(*)::text AS count
                    FROM transactions t
                    WHERE t.space_id = ANY(${spaceFilter})
                      AND (
                          t.source_account_id = ANY(${owned})
                          OR t.destination_account_id = ANY(${owned})
                      )
                      ${input.type ? sql`AND t.type = ${input.type as unknown as Transactions["type"]}` : sql``}
                      ${input.userId ? sql`AND t.created_by = ${input.userId}` : sql``}
                      ${
                          envelopIdFilter
                              ? sql`AND t.envelop_id = ANY(${envelopIdFilter})`
                              : input.envelopId === "__none"
                                ? sql`AND t.envelop_id IS NULL`
                                : sql``
                      }
                      ${categoryIds ? sql`AND t.expense_category_id = ANY(${categoryIds})` : sql``}
                      ${input.eventId ? sql`AND t.event_id = ${input.eventId}` : sql``}
                      ${accountIdFilter ? sql`AND (t.source_account_id = ANY(${accountIdFilter}) OR t.destination_account_id = ANY(${accountIdFilter}))` : sql``}
                      ${input.search ? sql`AND (t.description ILIKE ${`%${input.search}%`} OR t.location ILIKE ${`%${input.search}%`})` : sql``}
                      ${input.amountMin !== null && input.amountMin !== undefined ? sql`AND t.amount >= ${input.amountMin}` : sql``}
                      ${input.amountMax !== null && input.amountMax !== undefined ? sql`AND t.amount <= ${input.amountMax}` : sql``}
                      ${input.dateFrom ? sql`AND t.transaction_datetime >= ${input.dateFrom}` : sql``}
                      ${input.dateTo ? sql`AND t.transaction_datetime < ${input.dateTo}` : sql``}
                `.execute(ctx.services.qb);

                const r = row.rows[0];
                const inTotal = Number(r?.in_total ?? 0);
                const outTotal = Number(r?.out_total ?? 0);
                const count = Number(r?.count ?? 0);

                let days = 1;
                if (input.dateFrom && input.dateTo) {
                    const ms = input.dateTo.getTime() - input.dateFrom.getTime();
                    days = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
                }
                return {
                    inTotal,
                    outTotal,
                    net: inTotal - outTotal,
                    count,
                    avgPerDay: outTotal / days,
                    days,
                };
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message ||
                    "Failed to compute personal filtered totals",
            });
        }
        return result;
    });
