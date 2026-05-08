import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveOwnedAccountIds } from "./shared.mjs";

/**
 * Cross-space personal twin of `analytics.netWorthHistory`. Same per-bucket
 * asset/liability roll-up but scoped to the caller's owned accounts only.
 */
export const personalNetWorthHistory = authorizedProcedure
    .input(
        z.object({
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            bucket: z.enum(["day", "week", "month", "year"]).default("month"),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            (async () => {
                /* memberSpaces is intentionally NOT consulted here.
                   Every transaction touching an owned account
                   contributes to that account's running balance
                   regardless of which space was tagged on the row;
                   filtering by member spaces would make
                   `current_balance - sum(future deltas)` diverge from
                   the actual current balance. The personal-only-data
                   filter (member spaces) applies to *flow* views
                   (cashFlow, summary, txn lists), not to *stock* views
                   like net worth which must reconcile to the live
                   `account_balances` table. */
                const owned = await resolveOwnedAccountIds(
                    ctx.services.qb,
                    ctx.auth.user.id
                );
                if (owned.length === 0) return [];

                const interval =
                    input.bucket === "day"
                        ? "1 day"
                        : input.bucket === "week"
                          ? "1 week"
                          : input.bucket === "month"
                            ? "1 month"
                            : "1 year";

                const rows = await sql<{
                    bucket: Date;
                    assets: string;
                    liabilities: string;
                }>`
                    WITH scope_accounts AS (
                        SELECT a.id AS account_id, a.account_type::text AS account_type
                        FROM accounts a
                        WHERE a.id = ANY(${owned})
                    ),
                    current_balances AS (
                        SELECT sa.account_id, sa.account_type,
                               COALESCE(ab.balance, 0) AS balance
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
                                + CASE
                                    WHEN t.type IN ('expense','transfer','adjustment')
                                        AND t.source_account_id = sa.account_id
                                        THEN -t.amount
                                    ELSE 0
                                END
                                + CASE
                                    WHEN t.type = 'transfer'
                                        AND t.source_account_id = sa.account_id
                                        AND t.fee_amount IS NOT NULL
                                        THEN -t.fee_amount
                                    ELSE 0
                                END
                            ) AS delta
                        FROM scope_accounts sa
                        JOIN transactions t
                          ON (t.source_account_id = sa.account_id
                              OR t.destination_account_id = sa.account_id)
                        /* No period predicate: the back-walk needs the
                           full delta stream from each bucket through
                           "now" to reconcile with current_balance. A
                           transaction stamped after periodEnd still
                           sits between bucket B and current_balance,
                           and dropping it would overstate the
                           historical balance. The reviewer flag for
                           perf here is real but the proposed fix would
                           change the algorithm — leaving the scan
                           unbounded for correctness. */
                        GROUP BY sa.account_id, 2
                    ),
                    scope_x_buckets AS (
                        SELECT sa.account_id, sa.account_type, b.bucket
                        FROM scope_accounts sa
                        CROSS JOIN buckets b
                    ),
                    future_after AS (
                        SELECT sxb.account_id,
                               sxb.account_type,
                               sxb.bucket,
                               COALESCE(SUM(CASE
                                   WHEN bd.bucket > sxb.bucket THEN bd.delta
                                   ELSE 0
                               END), 0) AS future_delta
                        FROM scope_x_buckets sxb
                        LEFT JOIN bucket_deltas bd ON bd.account_id = sxb.account_id
                        GROUP BY sxb.account_id, sxb.account_type, sxb.bucket
                    ),
                    per_account AS (
                        SELECT
                            f.account_type,
                            f.bucket,
                            (COALESCE(cb.balance, 0) - f.future_delta) AS balance
                        FROM future_after f
                        LEFT JOIN current_balances cb ON cb.account_id = f.account_id
                    )
                    SELECT
                        bucket::timestamptz AS bucket,
                        SUM(CASE WHEN account_type IN ('asset','locked') THEN balance ELSE 0 END)::text AS assets,
                        SUM(CASE WHEN account_type = 'liability' THEN balance ELSE 0 END)::text AS liabilities
                    FROM per_account
                    GROUP BY bucket
                    ORDER BY bucket ASC
                `.execute(ctx.services.qb);

                return rows.rows.map((r) => {
                    const assets = Number(r.assets);
                    const liabilities = Number(r.liabilities);
                    return {
                        bucket: new Date(r.bucket),
                        assets,
                        liabilities,
                        netWorth: assets - liabilities,
                    };
                });
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message ||
                    "Failed to compute personal net worth history",
            });
        }
        return result;
    });
