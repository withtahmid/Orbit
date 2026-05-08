import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import {
    classifyCadence,
    type RecurringRow,
} from "../analytics/utils/recurringDetect.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

export const personalAnomaliesPatternBreaks = authorizedProcedure
    .input(
        z.object({
            lookbackDays: z.number().int().min(60).max(365).default(120),
            graceDays: z.number().int().min(0).max(14).default(2),
            lookaheadDays: z.number().int().min(1).max(60).default(7),
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
                if (owned.length === 0 || memberSpaces.length === 0) return [];

                const lookbackInterval = `${input.lookbackDays} days`;

                const rows = await sql<RecurringRow>`
                    WITH expense_txns AS (
                        SELECT
                            t.source_account_id,
                            LOWER(TRIM(COALESCE(t.description, ''))) AS merchant_key,
                            t.description AS merchant,
                            t.transaction_datetime AS dt,
                            t.amount::numeric AS amount,
                            t.expense_category_id
                        FROM transactions t
                        WHERE t.type = 'expense'
                          AND t.space_id = ANY(${memberSpaces})
                          AND t.source_account_id = ANY(${owned})
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
                `.execute(ctx.services.qb);

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
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message ||
                    "Failed to compute personal pattern breaks",
            });
        }
        return result;
    });
