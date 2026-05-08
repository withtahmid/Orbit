import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

export const personalAnomaliesOutliers = authorizedProcedure
    .input(
        z.object({
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            sigma: z.number().min(1).max(5).default(2),
            limit: z.number().int().min(1).max(100).default(20),
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
                    transaction_id: string;
                    transaction_datetime: Date;
                    amount: string;
                    description: string | null;
                    source_account_id: string | null;
                    category_id: string | null;
                    category_name: string | null;
                    category_color: string | null;
                    category_icon: string | null;
                    z_score: string;
                    cat_avg: string;
                }>`
                    WITH expenses AS (
                        SELECT
                            t.id,
                            t.transaction_datetime,
                            t.amount::numeric AS amount,
                            t.description,
                            t.source_account_id,
                            t.expense_category_id AS category_id
                        FROM transactions t
                        WHERE t.type = 'expense'
                          AND t.space_id = ANY(${memberSpaces})
                          AND t.source_account_id = ANY(${owned})
                          AND t.expense_category_id IS NOT NULL
                          AND t.transaction_datetime >= ${input.periodStart}
                          AND t.transaction_datetime < ${input.periodEnd}
                    ),
                    cat_stats AS (
                        SELECT category_id,
                               AVG(amount) AS avg_amount,
                               STDDEV_SAMP(amount) AS stddev_amount,
                               COUNT(*) AS hits
                        FROM expenses
                        GROUP BY category_id
                        HAVING COUNT(*) >= 3
                    )
                    SELECT
                        e.id::text AS transaction_id,
                        e.transaction_datetime,
                        e.amount::text,
                        e.description,
                        e.source_account_id::text AS source_account_id,
                        ec.id::text AS category_id,
                        ec.name AS category_name,
                        ec.color AS category_color,
                        ec.icon AS category_icon,
                        ((e.amount - cs.avg_amount) / NULLIF(cs.stddev_amount, 0))::text AS z_score,
                        cs.avg_amount::text AS cat_avg
                    FROM expenses e
                    JOIN cat_stats cs ON cs.category_id = e.category_id
                    JOIN expense_categories ec ON ec.id = e.category_id
                    WHERE cs.stddev_amount IS NOT NULL
                      AND cs.stddev_amount > 0
                      AND e.amount >= cs.avg_amount + (${input.sigma} * cs.stddev_amount)
                    ORDER BY (e.amount - cs.avg_amount) / NULLIF(cs.stddev_amount, 0) DESC
                    LIMIT ${input.limit}
                `.execute(ctx.services.qb);

                return rows.rows.map((r) => ({
                    transactionId: r.transaction_id,
                    transactionDatetime: new Date(r.transaction_datetime),
                    amount: Number(r.amount),
                    description: r.description,
                    sourceAccountId: r.source_account_id,
                    categoryId: r.category_id,
                    categoryName: r.category_name,
                    categoryColor: r.category_color,
                    categoryIcon: r.category_icon,
                    zScore: Number(r.z_score),
                    categoryAverage: Number(r.cat_avg),
                }));
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message ||
                    "Failed to compute personal outliers",
            });
        }
        return result;
    });
