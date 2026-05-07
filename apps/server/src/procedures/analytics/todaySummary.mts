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
 * Single-day inflow/outflow/net + transaction count for the Overview
 * TodayBand. The card also wants `clearedCount` / `pendingCount` and
 * `lastSyncAt`, but the schema doesn't carry transaction status or sync
 * metadata yet — those fields are intentionally absent from the response
 * so the UI can degrade cleanly until they exist. (See
 * /home/tahmid/.claude/plans/orbit-v2-backend-gaps.md §2.1.)
 */
export const todaySummary = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            day: z.coerce.date().optional(),
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

                const day = input.day ?? new Date();

                /* Day boundaries are computed by Postgres via
                   `date_trunc('day', ...)`, which respects the session
                   timezone (Asia/Dhaka). Computing them in JS via
                   `Date.UTC(...)` would slice a UTC day instead of a
                   Dhaka day — early-morning Dhaka transactions would
                   land in yesterday's window. */
                const row = await sql<{
                    day_start: Date;
                    in_total: string;
                    out_total: string;
                    txn_count: string;
                }>`
                    WITH scope_accounts AS (
                        SELECT account_id
                        FROM space_accounts
                        WHERE space_id = ${input.spaceId}
                    ),
                    bounds AS (
                        SELECT
                            date_trunc('day', ${day}::timestamptz) AS day_start,
                            date_trunc('day', ${day}::timestamptz) + INTERVAL '1 day' AS day_end
                    )
                    SELECT
                        (SELECT day_start FROM bounds) AS day_start,
                        COALESCE(SUM(CASE
                            WHEN t.type = 'income'
                                AND t.destination_account_id IN (SELECT account_id FROM scope_accounts) THEN t.amount
                            WHEN t.type = 'transfer'
                                AND t.destination_account_id IN (SELECT account_id FROM scope_accounts)
                                AND t.source_account_id NOT IN (SELECT account_id FROM scope_accounts) THEN t.amount
                            WHEN t.type = 'adjustment'
                                AND t.destination_account_id IN (SELECT account_id FROM scope_accounts) THEN t.amount
                            ELSE 0
                        END), 0)::text AS in_total,
                        COALESCE(SUM(
                            CASE
                                WHEN t.type = 'expense'
                                    AND t.source_account_id IN (SELECT account_id FROM scope_accounts) THEN t.amount
                                WHEN t.type = 'transfer'
                                    AND t.source_account_id IN (SELECT account_id FROM scope_accounts)
                                    AND t.destination_account_id NOT IN (SELECT account_id FROM scope_accounts) THEN t.amount
                                WHEN t.type = 'adjustment'
                                    AND t.source_account_id IN (SELECT account_id FROM scope_accounts) THEN t.amount
                                ELSE 0
                            END
                            + CASE
                                WHEN t.type = 'transfer'
                                    AND t.source_account_id IN (SELECT account_id FROM scope_accounts)
                                    AND t.fee_amount IS NOT NULL THEN t.fee_amount
                                ELSE 0
                            END
                        ), 0)::text AS out_total,
                        COUNT(*)::text AS txn_count
                    FROM transactions t
                    WHERE t.transaction_datetime >= (SELECT day_start FROM bounds)
                      AND t.transaction_datetime < (SELECT day_end FROM bounds)
                      AND (
                          t.source_account_id IN (SELECT account_id FROM scope_accounts)
                          OR t.destination_account_id IN (SELECT account_id FROM scope_accounts)
                      )
                `.execute(trx);

                const r = row.rows[0];
                const inTotal = Number(r?.in_total ?? 0);
                const outTotal = Number(r?.out_total ?? 0);
                return {
                    day: r?.day_start ? new Date(r.day_start) : day,
                    inTotal,
                    outTotal,
                    net: inTotal - outTotal,
                    txnCount: Number(r?.txn_count ?? 0),
                };
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute today summary",
            });
        }
        return result;
    });
