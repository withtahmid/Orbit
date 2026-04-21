import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

/**
 * Monthly personal cash-flow buckets across every space the caller is a
 * member of, filtered to owned accounts. Internal transfers (owned →
 * owned) are excluded — they're rebalancing, not income or expense. See
 * summary.mts for the full semantics.
 */
export const personalCashFlow = authorizedProcedure
    .input(
        z.object({
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            bucket: z.enum(["day", "week", "month"]).default("month"),
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

                const interval =
                    input.bucket === "day"
                        ? "1 day"
                        : input.bucket === "week"
                          ? "1 week"
                          : "1 month";

                // Always materialize the buckets so the chart has a
                // zero-filled axis even when the user has no owned
                // accounts or no memberships yet.
                if (owned.length === 0 || memberSpaces.length === 0) {
                    const emptyBuckets = await sql<{ bucket: Date }>`
                        SELECT generate_series(
                            date_trunc(${input.bucket}, ${input.periodStart}::timestamptz),
                            date_trunc(${input.bucket}, ${input.periodEnd}::timestamptz),
                            ${sql.raw(`'${interval}'::interval`)}
                        ) AS bucket
                    `.execute(ctx.services.qb);
                    return emptyBuckets.rows.map((r) => ({
                        bucket: new Date(r.bucket),
                        income: 0,
                        expense: 0,
                        net: 0,
                    }));
                }

                const query = sql<{
                    bucket: Date;
                    income: string;
                    expense: string;
                }>`
                    WITH buckets AS (
                        SELECT generate_series(
                            date_trunc(${input.bucket}, ${input.periodStart}::timestamptz),
                            date_trunc(${input.bucket}, ${input.periodEnd}::timestamptz),
                            ${sql.raw(`'${interval}'::interval`)}
                        ) AS bucket
                    ),
                    deltas AS (
                        SELECT
                            date_trunc(${input.bucket}, transaction_datetime) AS bucket,
                            SUM(CASE
                                WHEN type = 'income' AND destination_account_id = ANY(${owned}) THEN amount
                                WHEN type = 'transfer'
                                    AND destination_account_id = ANY(${owned})
                                    AND source_account_id <> ALL(${owned}) THEN amount
                                WHEN type = 'adjustment' AND destination_account_id = ANY(${owned}) THEN amount
                                ELSE 0
                            END) AS income,
                            SUM(
                                CASE
                                    WHEN type = 'expense' AND source_account_id = ANY(${owned}) THEN amount
                                    WHEN type = 'transfer'
                                        AND source_account_id = ANY(${owned})
                                        AND destination_account_id <> ALL(${owned}) THEN amount
                                    WHEN type = 'adjustment' AND source_account_id = ANY(${owned}) THEN amount
                                    ELSE 0
                                END
                                -- Transfer fees out of owned accounts
                                -- are personal outflow regardless of
                                -- whether the transfer itself is
                                -- internal (owned→owned).
                                + CASE
                                    WHEN type = 'transfer'
                                        AND source_account_id = ANY(${owned})
                                        AND fee_amount IS NOT NULL THEN fee_amount
                                    ELSE 0
                                END
                            ) AS expense
                        FROM transactions
                        WHERE space_id = ANY(${memberSpaces})
                          AND transaction_datetime >= ${input.periodStart}
                          AND transaction_datetime < ${input.periodEnd}
                          AND (
                              source_account_id = ANY(${owned})
                              OR destination_account_id = ANY(${owned})
                          )
                        GROUP BY 1
                    )
                    SELECT
                        b.bucket::timestamptz AS bucket,
                        COALESCE(d.income, 0)::text AS income,
                        COALESCE(d.expense, 0)::text AS expense
                    FROM buckets b
                    LEFT JOIN deltas d ON d.bucket = b.bucket
                    ORDER BY b.bucket ASC
                `;
                const res = await query.execute(ctx.services.qb);
                return res.rows.map((r) => ({
                    bucket: new Date(r.bucket),
                    income: Number(r.income),
                    expense: Number(r.expense),
                    net: Number(r.income) - Number(r.expense),
                }));
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute personal cash flow",
            });
        }
        return result;
    });
