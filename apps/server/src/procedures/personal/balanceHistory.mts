import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

/**
 * Per-account running balance for the caller's owned accounts, over the
 * set of transactions in every space they're a member of. Same shape as
 * analytics.balanceHistory — one line per account rather than a single
 * aggregate line. The `accountIds` filter narrows to a subset of owned
 * accounts; ids not owned by the caller are silently dropped.
 */
export const personalBalanceHistory = authorizedProcedure
    .input(
        z.object({
            accountIds: z.array(z.string().uuid()).optional(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            bucket: z.enum(["day", "week", "month", "year"]).default("day"),
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
                          : input.bucket === "month"
                            ? "1 month"
                            : "1 year";

                const hasFilter = !!input.accountIds && input.accountIds.length > 0;
                const ownedSet = new Set(owned);
                const scope = hasFilter
                    ? input.accountIds!.filter((id) => ownedSet.has(id))
                    : owned;

                if (scope.length === 0 || memberSpaces.length === 0) {
                    return { accounts: [], series: [] };
                }

                const seriesQuery = sql<{
                    account_id: string;
                    bucket: Date;
                    balance: string;
                }>`
                    WITH scope_accounts AS (
                        SELECT UNNEST(${scope}::uuid[]) AS account_id
                    ),
                    current_balances AS (
                        SELECT sa.account_id, COALESCE(ab.balance, 0) AS balance
                        FROM scope_accounts sa
                        LEFT JOIN account_balances ab ON ab.account_id = sa.account_id
                    ),
                    buckets AS (
                        SELECT generate_series(
                            date_trunc(${input.bucket}, ${input.periodStart}::timestamptz),
                            date_trunc(${input.bucket}, ${input.periodEnd}::timestamptz),
                            ${sql.raw(`'${interval}'::interval`)}
                        ) AS bucket
                    ),
                    bucket_deltas AS (
                        SELECT
                            sa.account_id,
                            date_trunc(${input.bucket}, t.transaction_datetime) AS bucket,
                            SUM(
                                CASE
                                    WHEN t.type IN ('income','transfer','adjustment')
                                        AND t.destination_account_id = sa.account_id
                                        THEN t.amount
                                    ELSE 0
                                END
                                +
                                CASE
                                    WHEN t.type IN ('expense','transfer','adjustment')
                                        AND t.source_account_id = sa.account_id
                                        THEN -t.amount
                                    ELSE 0
                                END
                                +
                                CASE
                                    WHEN t.type = 'transfer'
                                        AND t.source_account_id = sa.account_id
                                        AND t.fee_amount IS NOT NULL
                                        THEN -t.fee_amount
                                    ELSE 0
                                END
                            ) AS delta
                        FROM scope_accounts sa
                        JOIN transactions t ON t.space_id = ANY(${memberSpaces})
                            AND (
                                t.source_account_id = sa.account_id
                                OR t.destination_account_id = sa.account_id
                            )
                        GROUP BY sa.account_id, 2
                    ),
                    scope_x_buckets AS (
                        SELECT sa.account_id, b.bucket
                        FROM scope_accounts sa
                        CROSS JOIN buckets b
                    ),
                    future_after AS (
                        SELECT sxb.account_id,
                               sxb.bucket,
                               COALESCE(
                                   SUM(
                                       CASE
                                           WHEN bd.bucket > sxb.bucket THEN bd.delta
                                           ELSE 0
                                       END
                                   ),
                                   0
                               ) AS future_delta
                        FROM scope_x_buckets sxb
                        LEFT JOIN bucket_deltas bd
                            ON bd.account_id = sxb.account_id
                        GROUP BY sxb.account_id, sxb.bucket
                    )
                    SELECT
                        f.account_id,
                        f.bucket::timestamptz AS bucket,
                        (COALESCE(cb.balance, 0) - f.future_delta)::text AS balance
                    FROM future_after f
                    LEFT JOIN current_balances cb ON cb.account_id = f.account_id
                    ORDER BY f.account_id, f.bucket ASC
                `;

                const accountsQuery = sql<{
                    id: string;
                    name: string;
                    color: string;
                    icon: string;
                }>`
                    SELECT a.id, a.name, a.color, a.icon
                    FROM accounts a
                    WHERE a.id = ANY(${scope})
                    ORDER BY a.name ASC
                `;

                const [seriesRes, accountsRes] = await Promise.all([
                    seriesQuery.execute(ctx.services.qb),
                    accountsQuery.execute(ctx.services.qb),
                ]);

                return {
                    accounts: accountsRes.rows.map((a) => ({
                        id: a.id,
                        name: a.name,
                        color: a.color,
                        icon: a.icon,
                    })),
                    series: seriesRes.rows.map((r) => ({
                        accountId: r.account_id,
                        bucket: new Date(r.bucket),
                        balance: Number(r.balance),
                    })),
                };
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute personal balance history",
            });
        }
        return result;
    });
