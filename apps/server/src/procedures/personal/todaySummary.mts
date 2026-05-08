import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

export const personalTodaySummary = authorizedProcedure
    .input(z.object({ day: z.coerce.date().optional() }))
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            (async () => {
                /* Fetch owned accounts + member spaces in parallel — same
                   round-trip cost as a single query. */
                const [owned, memberSpaces] = await Promise.all([
                    resolveOwnedAccountIds(ctx.services.qb, ctx.auth.user.id),
                    resolveMemberSpaceIds(ctx.services.qb, ctx.auth.user.id),
                ]);

                const day = input.day ?? new Date();
                if (owned.length === 0 || memberSpaces.length === 0) {
                    /* Mirror the SQL-day truncation so the returned `day`
                       still represents Dhaka midnight, not browser-tz. */
                    const truncated = await sql<{ day_start: Date }>`
                        SELECT date_trunc('day', ${day}::timestamptz) AS day_start
                    `.execute(ctx.services.qb);
                    return {
                        day: truncated.rows[0]?.day_start
                            ? new Date(truncated.rows[0].day_start)
                            : day,
                        inTotal: 0,
                        outTotal: 0,
                        net: 0,
                        txnCount: 0,
                    };
                }

                /* Day boundaries computed in Postgres so they land on
                   session-timezone midnight (Asia/Dhaka). See
                   space-scoped twin for the full TZ commentary. */
                const row = await sql<{
                    day_start: Date;
                    in_total: string;
                    out_total: string;
                    txn_count: string;
                }>`
                    WITH bounds AS (
                        SELECT
                            date_trunc('day', ${day}::timestamptz) AS day_start,
                            date_trunc('day', ${day}::timestamptz) + INTERVAL '1 day' AS day_end
                    )
                    SELECT
                        (SELECT day_start FROM bounds) AS day_start,
                        COALESCE(SUM(CASE
                            WHEN t.type = 'income'
                                AND t.destination_account_id = ANY(${owned}) THEN t.amount
                            WHEN t.type = 'transfer'
                                AND t.destination_account_id = ANY(${owned})
                                AND t.source_account_id <> ALL(${owned}) THEN t.amount
                            WHEN t.type = 'adjustment'
                                AND t.destination_account_id = ANY(${owned}) THEN t.amount
                            ELSE 0
                        END), 0)::text AS in_total,
                        COALESCE(SUM(
                            CASE
                                WHEN t.type = 'expense'
                                    AND t.source_account_id = ANY(${owned}) THEN t.amount
                                WHEN t.type = 'transfer'
                                    AND t.source_account_id = ANY(${owned})
                                    AND t.destination_account_id <> ALL(${owned}) THEN t.amount
                                WHEN t.type = 'adjustment'
                                    AND t.source_account_id = ANY(${owned}) THEN t.amount
                                ELSE 0
                            END
                            + CASE
                                WHEN t.type = 'transfer'
                                    AND t.source_account_id = ANY(${owned})
                                    AND t.fee_amount IS NOT NULL THEN t.fee_amount
                                ELSE 0
                            END
                        ), 0)::text AS out_total,
                        COUNT(*)::text AS txn_count
                    FROM transactions t
                    WHERE t.space_id = ANY(${memberSpaces})
                      AND t.transaction_datetime >= (SELECT day_start FROM bounds)
                      AND t.transaction_datetime < (SELECT day_end FROM bounds)
                      AND (
                          t.source_account_id = ANY(${owned})
                          OR t.destination_account_id = ANY(${owned})
                      )
                `.execute(ctx.services.qb);

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
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message ||
                    "Failed to compute personal today summary",
            });
        }
        return result;
    });
