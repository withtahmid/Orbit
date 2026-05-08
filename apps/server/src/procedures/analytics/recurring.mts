import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import {
    classifyCadence,
    classifyKind,
    type RecurringRow,
} from "./utils/recurringDetect.mjs";

/**
 * Heuristic recurring-charge detector for the BillsCard, SubscriptionsGrid,
 * and downstream anomaly procedures (`anomalies.recurring`,
 * `anomalies.patternBreaks`). Single source of truth so all four surfaces
 * agree on what "recurring" means.
 *
 * Algorithm: group expense transactions by (source_account_id, normalized
 * description) over a lookback window. A group with ≥3 hits whose pairwise
 * intervals look weekly / biweekly / monthly / yearly is recurring. Cadence
 * comes from the average inter-arrival time; kind ("bill" vs "subscription")
 * from a small-amount cutoff on monthly groups (subscriptions are usually
 * < $50 monthly). UI-side overrides come later — for v1 the heuristic is
 * authoritative.
 */
export const recurring = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            kind: z.enum(["bill", "subscription", "all"]).default("all"),
            lookbackDays: z.number().int().min(30).max(365).default(120),
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
                    ORDER BY last_seen DESC
                `.execute(trx);

                const items = rows.rows
                    .map((r) => {
                        const intervalDays =
                            r.avg_interval_days != null
                                ? Number(r.avg_interval_days)
                                : null;
                        const cadence = classifyCadence(intervalDays);
                        if (!cadence) return null;
                        const lastAmount = Number(r.last_amount);
                        const avgAmount = Number(r.avg_amount);
                        const lastSeen = new Date(r.last_seen);
                        const nextExpectedDate =
                            intervalDays != null
                                ? new Date(
                                      lastSeen.getTime() +
                                          intervalDays * 86_400_000
                                  )
                                : null;
                        return {
                            merchant: r.merchant,
                            merchantKey: r.merchant_key,
                            sourceAccountId: r.source_account_id,
                            expenseCategoryId: r.expense_category_id,
                            cadence,
                            avgAmount,
                            lastAmount,
                            prevAmount:
                                r.prev_amount != null
                                    ? Number(r.prev_amount)
                                    : null,
                            hits: Number(r.hits),
                            firstSeen: new Date(r.first_seen),
                            lastSeen,
                            prevDate:
                                r.prev_date != null
                                    ? new Date(r.prev_date)
                                    : null,
                            nextExpectedDate,
                            kind: classifyKind(cadence, avgAmount),
                            confidence:
                                intervalDays != null
                                    ? cadenceConfidence(
                                          cadence,
                                          intervalDays
                                      )
                                    : 0,
                        };
                    })
                    .filter(
                        <T,>(x: T): x is NonNullable<T> => x !== null
                    );

                const filtered =
                    input.kind === "all"
                        ? items
                        : items.filter((i) => i.kind === input.kind);
                return filtered;
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to detect recurring charges",
            });
        }
        return result;
    });

/** How tightly the cadence fits the observed intervals. */
function cadenceConfidence(
    cadence: "weekly" | "biweekly" | "monthly" | "yearly",
    intervalDays: number
) {
    const target =
        cadence === "weekly"
            ? 7
            : cadence === "biweekly"
              ? 14
              : cadence === "monthly"
                ? 30.4
                : 365;
    const drift = Math.abs(intervalDays - target) / target;
    return Math.max(0, Math.min(1, 1 - drift));
}
