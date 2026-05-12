import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import {
    ALL_ROLES,
    resolveSpaceMembership,
} from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Per-bucket top expense category — one row per bucket with the leading
 * category for that bucket. CashFlowView previously called the flat
 * `topCategories` once for the whole window and showed the same leader
 * on every monthly row; this lets it surface a per-month leader instead.
 *
 * Use the original `topCategories` for a flat top-N over the entire
 * window — this procedure is specifically the bucketed shape.
 */
export const topCategoriesByBucket = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            bucket: z.enum(["day", "week", "month"]).default("month"),
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

                const interval =
                    input.bucket === "day"
                        ? "1 day"
                        : input.bucket === "week"
                          ? "1 week"
                          : "1 month";

                /* Scope by space_accounts (cash-flow rule §12). Tie-break
                   on category_id ASC so two categories with identical
                   totals always pick the same winner across reloads. */
                const rows = await sql<{
                    bucket: Date;
                    id: string | null;
                    name: string | null;
                    color: string | null;
                    icon: string | null;
                    total: string;
                }>`
                    WITH scope_accounts AS (
                        SELECT account_id
                        FROM space_accounts
                        WHERE space_id = ${input.spaceId}
                    ),
                    spending AS (
                        SELECT
                            date_trunc(${input.bucket}, transaction_datetime) AS bucket,
                            expense_category_id AS category_id,
                            amount
                        FROM transactions
                        WHERE type = 'expense'
                          AND source_account_id IN (SELECT account_id FROM scope_accounts)
                          AND expense_category_id IS NOT NULL
                          AND transaction_datetime >= ${input.periodStart}
                          AND transaction_datetime < ${input.periodEnd}
                    ),
                    rolled AS (
                        SELECT bucket, category_id, SUM(amount) AS total
                        FROM spending
                        GROUP BY bucket, category_id
                    ),
                    ranked AS (
                        SELECT
                            bucket,
                            category_id,
                            total,
                            ROW_NUMBER() OVER (
                                PARTITION BY bucket
                                ORDER BY total DESC, category_id ASC
                            ) AS rk
                        FROM rolled
                    ),
                    buckets AS (
                        SELECT generate_series(
                            date_trunc(${input.bucket}, ${input.periodStart}::timestamptz),
                            date_trunc(${input.bucket}, ${input.periodEnd}::timestamptz),
                            ${sql.raw(`'${interval}'::interval`)}
                        ) AS bucket
                    )
                    SELECT
                        b.bucket::timestamptz AS bucket,
                        ec.id::text AS id,
                        ec.name,
                        ec.color,
                        ec.icon,
                        COALESCE(r.total, 0)::text AS total
                    FROM buckets b
                    LEFT JOIN ranked r ON r.bucket = b.bucket AND r.rk = 1
                    LEFT JOIN expense_categories ec ON ec.id = r.category_id
                    ORDER BY b.bucket ASC
                `.execute(trx);

                return rows.rows.map((r) => ({
                    bucket: new Date(r.bucket),
                    top: r.id
                        ? {
                              categoryId: r.id,
                              name: r.name as string,
                              color: r.color as string,
                              icon: r.icon as string,
                              total: Number(r.total),
                          }
                        : null,
                }));
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message ||
                    "Failed to compute top categories by bucket",
            });
        }
        return result;
    });
