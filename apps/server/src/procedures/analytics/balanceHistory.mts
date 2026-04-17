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
            accountId: z.string().uuid().optional(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            bucket: z.enum(["day", "week", "month"]).default("day"),
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
                          : "1 month";

                // Compute the current total balance of the space (or a single account)
                // and the time-series of net deltas. Work backward from the current balance.
                const query = sql<{
                    bucket: Date;
                    balance: string;
                }>`
                    WITH scope_accounts AS (
                        SELECT sa.account_id
                        FROM space_accounts sa
                        WHERE sa.space_id = ${input.spaceId}
                          ${input.accountId ? sql`AND sa.account_id = ${input.accountId}` : sql``}
                    ),
                    current_balance AS (
                        SELECT COALESCE(SUM(ab.balance), 0) AS balance
                        FROM account_balances ab
                        JOIN scope_accounts sa ON sa.account_id = ab.account_id
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
                            date_trunc(${input.bucket}, t.transaction_datetime) AS bucket,
                            SUM(CASE
                                WHEN t.type IN ('income','transfer','adjustment') AND t.destination_account_id IN (SELECT account_id FROM scope_accounts) THEN t.amount
                                WHEN t.type IN ('expense','transfer','adjustment') AND t.source_account_id IN (SELECT account_id FROM scope_accounts) THEN -t.amount
                                ELSE 0
                            END) AS delta
                        FROM transactions t
                        WHERE t.space_id = ${input.spaceId}
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
                const res = await query.execute(trx);
                return res.rows.map((r) => ({
                    bucket: new Date(r.bucket),
                    balance: Number(r.balance),
                }));
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
