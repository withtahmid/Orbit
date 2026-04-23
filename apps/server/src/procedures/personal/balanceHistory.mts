import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

/**
 * Running total balance for the caller's owned accounts over time, unioned
 * across every space they're a member of. Same "work backward from current
 * total" shape as analytics.balanceHistory — swap `scope_accounts` from
 * "accounts in one space" to "accounts the caller owns".
 *
 * The `accountIds` filter, if passed, narrows the scope to that subset.
 * Any id not owned by the caller is silently dropped.
 */
export const personalBalanceHistory = authorizedProcedure
    .input(
        z.object({
            accountIds: z.array(z.string().uuid()).optional(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            bucket: z.enum(["day", "week", "month"]).default("day"),
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

                // Restrict caller-supplied ids to owned accounts. An empty
                // array after filtering means "no valid accounts" and we
                // short-circuit to zero-filled buckets below.
                const hasFilter = !!input.accountIds && input.accountIds.length > 0;
                const ownedSet = new Set(owned);
                const scope = hasFilter
                    ? input.accountIds!.filter((id) => ownedSet.has(id))
                    : owned;

                if (scope.length === 0 || memberSpaces.length === 0) {
                    const emptyBuckets = await sql<{ bucket: Date }>`
                        SELECT generate_series(
                            date_trunc(${input.bucket}, ${input.periodStart}::timestamptz),
                            date_trunc(${input.bucket}, ${input.periodEnd}::timestamptz),
                            ${sql.raw(`'${interval}'::interval`)}
                        ) AS bucket
                    `.execute(ctx.services.qb);
                    return emptyBuckets.rows.map((r) => ({
                        bucket: new Date(r.bucket),
                        balance: 0,
                    }));
                }

                const query = sql<{
                    bucket: Date;
                    balance: string;
                }>`
                    WITH current_balance AS (
                        SELECT COALESCE(SUM(ab.balance), 0) AS balance
                        FROM account_balances ab
                        WHERE ab.account_id = ANY(${scope})
                    ),
                    buckets AS (
                        SELECT generate_series(
                            date_trunc(${input.bucket}, ${input.periodStart}::timestamptz),
                            date_trunc(${input.bucket}, ${input.periodEnd}::timestamptz),
                            ${sql.raw(`'${interval}'::interval`)}
                        ) AS bucket
                    ),
                    bucket_deltas AS (
                        -- Branches summed additively (not mutually
                        -- exclusive) so an intra-scope transfer correctly
                        -- nets to 0 instead of double-counting the
                        -- destination leg.
                        SELECT
                            date_trunc(${input.bucket}, t.transaction_datetime) AS bucket,
                            SUM(
                                CASE
                                    WHEN t.type IN ('income','transfer','adjustment')
                                        AND t.destination_account_id = ANY(${scope})
                                        THEN t.amount
                                    ELSE 0
                                END
                                +
                                CASE
                                    WHEN t.type IN ('expense','transfer','adjustment')
                                        AND t.source_account_id = ANY(${scope})
                                        THEN -t.amount
                                    ELSE 0
                                END
                            ) AS delta
                        FROM transactions t
                        WHERE t.space_id = ANY(${memberSpaces})
                          AND (
                              t.source_account_id = ANY(${scope})
                              OR t.destination_account_id = ANY(${scope})
                          )
                        GROUP BY 1
                    ),
                    future_after AS (
                        SELECT b.bucket,
                               COALESCE(SUM(CASE WHEN bd.bucket > b.bucket THEN bd.delta ELSE 0 END), 0) AS future_delta
                        FROM buckets b
                        LEFT JOIN bucket_deltas bd ON TRUE
                        GROUP BY b.bucket
                    )
                    SELECT
                        b.bucket::timestamptz AS bucket,
                        ((SELECT balance FROM current_balance) - f.future_delta)::text AS balance
                    FROM buckets b
                    JOIN future_after f ON f.bucket = b.bucket
                    ORDER BY b.bucket ASC
                `;
                const res = await query.execute(ctx.services.qb);
                return res.rows.map((r) => ({
                    bucket: new Date(r.bucket),
                    balance: Number(r.balance),
                }));
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
