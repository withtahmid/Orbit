import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

/**
 * Top expense categories the caller has spent on across every space,
 * limited to expenses paid out of accounts the caller owns. The same
 * category name can legitimately appear twice — categories are
 * space-scoped, so this procedure returns `(categoryId, spaceName)` pairs
 * and leaves disambiguation to the UI rather than collapsing them by
 * name (which would silently merge unrelated buckets).
 */
export const personalTopCategories = authorizedProcedure
    .input(
        z.object({
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            limit: z.number().int().min(1).max(50).default(5),
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
                if (owned.length === 0 || memberSpaces.length === 0) return [];

                const rows = await sql<{
                    id: string;
                    name: string;
                    color: string;
                    icon: string;
                    space_id: string;
                    space_name: string;
                    total: string;
                }>`
                    WITH spending AS (
                        SELECT
                            expense_category_id AS category_id,
                            space_id,
                            amount
                        FROM transactions
                        WHERE type = 'expense'
                          AND space_id = ANY(${memberSpaces})
                          AND source_account_id = ANY(${owned})
                          AND expense_category_id IS NOT NULL
                          AND transaction_datetime >= ${input.periodStart}
                          AND transaction_datetime < ${input.periodEnd}
                        UNION ALL
                        -- Transfer fees out of owned accounts count the
                        -- same as a regular personal expense in the
                        -- fee's category. Internal (owned→owned)
                        -- transfers still pay a fee and it's still the
                        -- user's outflow.
                        SELECT
                            fee_expense_category_id AS category_id,
                            space_id,
                            fee_amount AS amount
                        FROM transactions
                        WHERE type = 'transfer'
                          AND fee_amount IS NOT NULL
                          AND space_id = ANY(${memberSpaces})
                          AND source_account_id = ANY(${owned})
                          AND transaction_datetime >= ${input.periodStart}
                          AND transaction_datetime < ${input.periodEnd}
                    )
                    SELECT
                        ec.id::text AS id,
                        ec.name,
                        ec.color,
                        ec.icon,
                        s.id::text AS space_id,
                        s.name AS space_name,
                        SUM(spending.amount)::text AS total
                    FROM spending
                    JOIN expense_categories ec ON ec.id = spending.category_id
                    JOIN spaces s ON s.id = spending.space_id
                    GROUP BY ec.id, ec.name, ec.color, ec.icon, s.id, s.name
                    ORDER BY SUM(spending.amount) DESC
                    LIMIT ${input.limit}
                `.execute(ctx.services.qb);

                return rows.rows.map((r) => ({
                    id: r.id,
                    name: r.name,
                    color: r.color,
                    icon: r.icon,
                    spaceId: r.space_id,
                    spaceName: r.space_name,
                    total: Number(r.total),
                }));
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute personal top categories",
            });
        }
        return result;
    });
