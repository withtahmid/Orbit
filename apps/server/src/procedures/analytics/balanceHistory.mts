import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const balanceHistory = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            // One or more account ids to narrow the scope to. Empty array
            // is treated like "no filter" (every account in the space);
            // ids not in the space are silently ignored.
            accountIds: z.array(z.string().uuid()).optional(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            bucket: z.enum(["day", "week", "month", "year"]).default("day"),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor", "viewer"] as unknown as SpaceMembers["role"][],
                });

                const interval =
                    input.bucket === "day"
                        ? "1 day"
                        : input.bucket === "week"
                          ? "1 week"
                          : input.bucket === "month"
                            ? "1 month"
                            : "1 year";

                const hasAccountFilter =
                    !!input.accountIds && input.accountIds.length > 0;

                // Per-account balance time-series: walk each account
                // backward from its current balance by summing future net
                // deltas. Same delta formula as the aggregate view, split
                // by account_id so every account gets its own series.
                //
                // Population is by account membership, not by the row's
                // `space_id` tag (see spec §12). The balance trigger
                // updates `account_balances` regardless of which space
                // the transaction was stamped with, so the delta stream
                // that walks backward from `current_balances` must
                // mirror that or the chart will contradict today's
                // balance.
                const seriesQuery = sql<{
                    account_id: string;
                    bucket: Date;
                    balance: string;
                }>`
                    WITH scope_accounts AS (
                        SELECT sa.account_id
                        FROM space_accounts sa
                        WHERE sa.space_id = ${input.spaceId}
                          ${hasAccountFilter ? sql`AND sa.account_id = ANY(${input.accountIds})` : sql``}
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
                                -- Transfer fee leaves the source on top
                                -- of amount; the balance trigger debits
                                -- source by amount + fee, so the delta
                                -- stream must too or the backward-walk
                                -- from current_balance bleeds the fee
                                -- into the pre-window baseline.
                                CASE
                                    WHEN t.type = 'transfer'
                                        AND t.source_account_id = sa.account_id
                                        AND t.fee_amount IS NOT NULL
                                        THEN -t.fee_amount
                                    ELSE 0
                                END
                            ) AS delta
                        FROM scope_accounts sa
                        JOIN transactions t
                            ON t.source_account_id = sa.account_id
                            OR t.destination_account_id = sa.account_id
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
                    JOIN space_accounts sa ON sa.account_id = a.id
                    WHERE sa.space_id = ${input.spaceId}
                      ${hasAccountFilter ? sql`AND a.id = ANY(${input.accountIds})` : sql``}
                    ORDER BY a.name ASC
                `;

                const [seriesRes, accountsRes] = await Promise.all([
                    seriesQuery.execute(trx),
                    accountsQuery.execute(trx),
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
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute balance history",
            });
        }
        return result;
    });
