import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import {
    classifyCadence,
    type RecurringRow,
} from "./utils/recurringDetect.mjs";

/**
 * "Expected charges that haven't posted yet." Recurring streams whose
 * next predicted hit is between `[graceDays, lookaheadDays]` overdue —
 * far enough past due to be worth surfacing, not so far that a
 * `recurring`-status "cancelled" flag would already have it. Together
 * with `anomaliesRecurring` this draws the line between "missed this
 * cycle" and "stream is gone."
 */
export const anomaliesPatternBreaks = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            lookbackDays: z.number().int().min(60).max(365).default(120),
            graceDays: z.number().int().min(0).max(14).default(2),
            lookaheadDays: z.number().int().min(1).max(60).default(7),
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

                const lookbackInterval = `${input.lookbackDays} days`;

                const rows = await sql<RecurringRow>`
                    WITH scope_accounts AS (
                        SELECT account_id
                        FROM space_accounts
                        WHERE space_id = ${input.spaceId}
                    ),
                    expense_txns AS (
                        SELECT
                            t.source_account_id,
                            LOWER(TRIM(COALESCE(t.description, ''))) AS merchant_key,
                            t.description AS merchant,
                            t.transaction_datetime AS dt,
                            t.amount::numeric AS amount,
                            t.expense_category_id
                        FROM transactions t
                        WHERE t.type = 'expense'
                          AND t.source_account_id IN (SELECT account_id FROM scope_accounts)
                          AND t.description IS NOT NULL
                          AND TRIM(t.description) <> ''
                          AND t.transaction_datetime >= NOW() - ${sql.raw(`'${lookbackInterval}'::interval`)}
                    ),
                    grouped AS (
                        SELECT
                            source_account_id,
                            merchant_key,
                            (ARRAY_AGG(merchant ORDER BY dt DESC))[1] AS merchant,
                            (ARRAY_AGG(expense_category_id ORDER BY dt DESC))[1] AS expense_category_id,
                            COUNT(*) AS hits,
                            AVG(amount) AS avg_amount,
                            MIN(dt) AS first_seen,
                            MAX(dt) AS last_seen,
                            (ARRAY_AGG(amount ORDER BY dt DESC))[1] AS last_amount,
                            (ARRAY_AGG(amount ORDER BY dt DESC))[2] AS prev_amount,
                            (ARRAY_AGG(dt ORDER BY dt DESC))[2] AS prev_date,
                            CASE
                                WHEN COUNT(*) > 1 THEN
                                    EXTRACT(EPOCH FROM (MAX(dt) - MIN(dt))) / 86400.0
                                        / (COUNT(*) - 1)
                                ELSE NULL
                            END AS avg_interval_days
                        FROM expense_txns
                        GROUP BY source_account_id, merchant_key
                        HAVING COUNT(*) >= 3
                    )
                    SELECT
                        merchant_key::text AS merchant_key,
                        merchant::text AS merchant,
                        source_account_id::text AS source_account_id,
                        expense_category_id::text AS expense_category_id,
                        hits::text AS hits,
                        avg_amount::text AS avg_amount,
                        last_amount::text AS last_amount,
                        prev_amount::text AS prev_amount,
                        last_seen::timestamptz AS last_seen,
                        prev_date::timestamptz AS prev_date,
                        first_seen::timestamptz AS first_seen,
                        avg_interval_days::text AS avg_interval_days
                    FROM grouped
                `.execute(trx);

                const now = Date.now();
                const items: Array<{
                    merchant: string;
                    merchantKey: string;
                    sourceAccountId: string;
                    cadence: "weekly" | "biweekly" | "monthly" | "yearly";
                    expectedAmount: number;
                    expectedDate: Date;
                    daysOverdue: number;
                    lastSeenDate: Date;
                }> = [];

                for (const r of rows.rows) {
                    const intervalDays =
                        r.avg_interval_days != null
                            ? Number(r.avg_interval_days)
                            : null;
                    const cadence = classifyCadence(intervalDays);
                    if (!cadence || intervalDays == null) continue;

                    const lastSeen = new Date(r.last_seen);
                    const expectedNext = new Date(
                        lastSeen.getTime() + intervalDays * 86_400_000
                    );
                    const daysOverdue =
                        (now - expectedNext.getTime()) / 86_400_000;

                    if (
                        daysOverdue >= input.graceDays &&
                        daysOverdue <= input.lookaheadDays
                    ) {
                        items.push({
                            merchant: r.merchant,
                            merchantKey: r.merchant_key,
                            sourceAccountId: r.source_account_id,
                            cadence,
                            expectedAmount: Number(r.avg_amount),
                            expectedDate: expectedNext,
                            daysOverdue,
                            lastSeenDate: lastSeen,
                        });
                    }
                }

                items.sort((a, b) => b.daysOverdue - a.daysOverdue);
                return items;
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message || "Failed to compute pattern breaks",
            });
        }
        return result;
    });
