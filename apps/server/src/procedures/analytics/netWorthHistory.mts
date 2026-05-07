import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Per-bucket net worth, assets, and liabilities for the space. Same
 * backward-walking technique as `analytics.balanceHistory` — start from
 * each account's current balance and subtract the future deltas — but
 * rolled up by `accounts.account_type` to surface the asset / liability
 * partition over time.
 *
 * `assets` (asset + locked accounts) and `liabilities` are both returned
 * as positive numbers as Postgres knows them. The frontend computes net
 * worth as `assets - liabilities`. Earlier docstring said the SQL
 * flipped liability signs — that was never true; the JS layer does it.
 */
export const netWorthHistory = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            bucket: z.enum(["day", "week", "month", "year"]).default("month"),
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

                const rows = await sql<{
                    bucket: Date;
                    assets: string;
                    liabilities: string;
                }>`
                    WITH scope_accounts AS (
                        SELECT sa.account_id, a.account_type::text AS account_type
                        FROM space_accounts sa
                        JOIN accounts a ON a.id = sa.account_id
                        WHERE sa.space_id = ${input.spaceId}
                    ),
                    current_balances AS (
                        SELECT sa.account_id,
                               sa.account_type,
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
                            ON t.source_account_id = sa.account_id
                            OR t.destination_account_id = sa.account_id
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
                `.execute(trx);

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
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message || "Failed to compute net worth history",
            });
        }
        return result;
    });
