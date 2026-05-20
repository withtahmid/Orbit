import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import {
    ALL_ROLES,
    resolveSpaceMembership,
} from "../space/utils/resolveSpaceMembership.mjs";
import {
    categoryFilterWhere,
    envelopeFilterWhere,
    scopeAccountsFilter,
    selectedCategoriesCTEClause,
    trendsFilterInputShape,
} from "./utils/trendsFilters.mjs";

/**
 * Categories with the largest movement vs the immediately-preceding window
 * of equal length. Sorted by absolute delta amount desc — biggest swings
 * (in either direction) bubble to the top.
 *
 * Filter behavior:
 *   - 0 / 2+ categories selected: standard view, grouped by each
 *     transaction's tagged `expense_category_id` (so leaf categories
 *     bubble up the way they always have), narrowed to the union of
 *     selected subtrees if any.
 *   - Exactly 1 category selected: drill-in mode. Every transaction in
 *     the subtree is rolled up to the *direct child* of the selected
 *     root and grouped there. Transactions tagged at the root itself
 *     are excluded (they have no child to attribute to). The frontend
 *     can detect this mode by the response's `mode` field and adjust
 *     the card title accordingly.
 */
export const trendsCategoryMovers = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            limit: z.number().int().min(1).max(50).default(10),
            ...trendsFilterInputShape,
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ALL_ROLES,
                });

                const durationMs =
                    input.periodEnd.getTime() - input.periodStart.getTime();
                const prevStart = new Date(
                    input.periodStart.getTime() - durationMs
                );

                const isDrillIn = (input.categoryIds?.length ?? 0) === 1;
                const drillRoot = isDrillIn ? input.categoryIds![0] : null;
                const envWhere = envelopeFilterWhere(input.envelopeIds);
                const acctScope = scopeAccountsFilter(input.accountIds);

                /* Scope by space_accounts (cash-flow rule §12) so cross-
                   space transfer fees and accounts shared late don't
                   silently disappear. */
                const rows = await (drillRoot
                    ? sql<{
                          id: string;
                          name: string;
                          color: string;
                          icon: string;
                          cur: string;
                          prv: string;
                      }>`
                    WITH RECURSIVE child_of_root AS (
                        /* Seed: direct children of the selected root. */
                        SELECT id, id AS root_child_id, ARRAY[id]::uuid[] AS path
                        FROM expense_categories
                        WHERE parent_id = ${drillRoot}
                          AND space_id = ${input.spaceId}
                        UNION ALL
                        /* Recurse: each descendant inherits its
                           ancestor-direct-child's root_child_id, so
                           transactions tagged anywhere in the subtree
                           bucket up to one of the root's direct kids.
                           Path-array + NOT ANY guards against a
                           parent_id cycle (changeParent only forbids
                           self-parent, not A then B then A). */
                        SELECT ec.id, cor.root_child_id, cor.path || ec.id
                        FROM expense_categories ec
                        JOIN child_of_root cor ON ec.parent_id = cor.id
                        WHERE ec.space_id = ${input.spaceId}
                          AND NOT (ec.id = ANY(cor.path))
                    ),
                    scope_accounts AS (
                        SELECT account_id
                        FROM space_accounts
                        WHERE space_id = ${input.spaceId}
                        ${acctScope}
                    ),
                    spending AS (
                        SELECT
                            cor.root_child_id AS category_id,
                            t.amount,
                            t.transaction_datetime AS dt
                        FROM transactions t
                        JOIN child_of_root cor ON cor.id = t.expense_category_id
                        WHERE t.type = 'expense'
                          AND t.source_account_id IN (SELECT account_id FROM scope_accounts)
                          AND t.transaction_datetime >= ${prevStart}
                          AND t.transaction_datetime < ${input.periodEnd}
                          ${envWhere}
                    )
                    SELECT
                        ec.id::text AS id,
                        ec.name,
                        ec.color,
                        ec.icon,
                        COALESCE(SUM(CASE WHEN s.dt >= ${input.periodStart} THEN s.amount ELSE 0 END), 0)::text AS cur,
                        COALESCE(SUM(CASE WHEN s.dt < ${input.periodStart} THEN s.amount ELSE 0 END), 0)::text AS prv
                    FROM spending s
                    JOIN expense_categories ec ON ec.id = s.category_id
                    GROUP BY ec.id, ec.name, ec.color, ec.icon
                `.execute(trx)
                    : sql<{
                          id: string;
                          name: string;
                          color: string;
                          icon: string;
                          cur: string;
                          prv: string;
                      }>`
                    WITH RECURSIVE ${selectedCategoriesCTEClause(input.categoryIds, [input.spaceId])}
                    scope_accounts AS (
                        SELECT account_id
                        FROM space_accounts
                        WHERE space_id = ${input.spaceId}
                        ${acctScope}
                    ),
                    spending AS (
                        SELECT
                            t.expense_category_id AS category_id,
                            t.amount,
                            t.transaction_datetime AS dt
                        FROM transactions t
                        WHERE t.type = 'expense'
                          AND t.source_account_id IN (SELECT account_id FROM scope_accounts)
                          AND t.expense_category_id IS NOT NULL
                          AND t.transaction_datetime >= ${prevStart}
                          AND t.transaction_datetime < ${input.periodEnd}
                          ${envWhere}
                          ${categoryFilterWhere(input.categoryIds)}
                    )
                    SELECT
                        ec.id::text AS id,
                        ec.name,
                        ec.color,
                        ec.icon,
                        COALESCE(SUM(CASE WHEN s.dt >= ${input.periodStart} THEN s.amount ELSE 0 END), 0)::text AS cur,
                        COALESCE(SUM(CASE WHEN s.dt < ${input.periodStart} THEN s.amount ELSE 0 END), 0)::text AS prv
                    FROM spending s
                    JOIN expense_categories ec ON ec.id = s.category_id
                    GROUP BY ec.id, ec.name, ec.color, ec.icon
                `.execute(trx));

                const items = rows.rows.map((r) => {
                    const cur = Number(r.cur);
                    const prv = Number(r.prv);
                    const deltaAmount = cur - prv;
                    const deltaPct =
                        prv === 0
                            ? cur > 0
                                ? 1
                                : 0
                            : (cur - prv) / prv;
                    return {
                        categoryId: r.id,
                        name: r.name,
                        color: r.color,
                        icon: r.icon,
                        currentTotal: cur,
                        previousTotal: prv,
                        deltaAmount,
                        deltaPct,
                    };
                });
                items.sort(
                    (a, b) =>
                        Math.abs(b.deltaAmount) - Math.abs(a.deltaAmount)
                );
                return {
                    mode: drillRoot ? ("drill" as const) : ("standard" as const),
                    drillRootCategoryId: drillRoot,
                    items: items.slice(0, input.limit),
                };
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message ||
                    "Failed to compute trends category movers",
            });
        }
        return result;
    });
