import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

const granularitySchema = z.enum(["week", "month", "quarter", "year"]);
type Granularity = z.infer<typeof granularitySchema>;

/**
 * Per-granularity bucket layout. The cumulative race chart needs a
 * tractable bucket count regardless of period length.
 *
 * Day buckets for week / month / quarter; month buckets for year. We
 * intentionally do *not* use weekly buckets for quarter — quarter
 * boundaries (Jan 1, Apr 1, Jul 1, Oct 1) almost never fall on an
 * ISO Monday, so a Mon-aligned weekly bucket would straddle the
 * quarter boundary and classify early days of the quarter into the
 * previous one. A 91-day cumulative chart reads just fine.
 */
const GRANULARITY_CONFIG: Record<
    Granularity,
    {
        periodInterval: string;
        bucketInterval: string;
        bucketUnit: "day" | "week" | "month";
        bucketDays: number;
    }
> = {
    week: { periodInterval: "1 week", bucketInterval: "1 day", bucketUnit: "day", bucketDays: 1 },
    month: { periodInterval: "1 month", bucketInterval: "1 day", bucketUnit: "day", bucketDays: 1 },
    quarter: { periodInterval: "3 months", bucketInterval: "1 day", bucketUnit: "day", bucketDays: 1 },
    year: { periodInterval: "1 year", bucketInterval: "1 month", bucketUnit: "month", bucketDays: 30 },
};

/**
 * Granularity-aware comparison data for the Trends view's primary chart.
 *
 * Returns three same-length arrays per bucket:
 *   - `current`: spend in the active period
 *   - `previous`: spend in the immediately-preceding period
 *   - `average`: per-bucket mean across *every* prior period the user
 *     has data for (excluding the current period). Aggregated
 *     positionally — `average[i]` is the average spend at the i-th
 *     bucket across all prior periods. The frontend cumulates this to
 *     draw a typical-shape reference behind the solid/dashed lines: it
 *     captures rhythm (rent on day 1, weekend bumps) that a flat
 *     run-rate would smooth away.
 *
 * Bounds are computed by Postgres via `date_trunc(granularity, ...)`,
 * which respects the session timezone (Asia/Dhaka). Computing the same
 * boundaries in JS via `Date.UTC(...)` was the source of the off-by-one
 * "no spend" reports east of UTC.
 */
export const trendsDailyComparison = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            anchor: z.coerce.date().optional(),
            granularity: granularitySchema.default("month"),
            /**
             * `cash` (default) — outflows include cross-space outbound
             * transfer principal (matches `cashFlow` mode='cash' and
             * the bank-balance view).
             * `operational` — only true type='expense' debits +
             * transfer fees. Transfer principal excluded.
             *
             * Note: this proc has no income column — it's an outflow /
             * spending series. The mode controls whether the spend
             * total counts cross-space outbound transfers as
             * "spending."
             */
            mode: z.enum(["cash", "operational"]).default("cash"),
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

                const cfg = GRANULARITY_CONFIG[input.granularity];
                const anchor = input.anchor ?? new Date();
                /* Multiplier for the cross-space transfer-principal
                   branch — derived from the Zod enum, no injection
                   surface. Same pattern as cashFlow.mts. */
                const xferFactor = input.mode === "cash" ? 1 : 0;

                /* The query produces three logical streams in one shot:
                   - kind='cur'  : one row per bucket of the active period
                   - kind='prev' : one row per bucket of the prior period
                   - kind='avg'  : one row per bucket position (1..N),
                                   each carrying the AVG across every
                                   historical period at that position
                   Indices are within-period (1..periodLength), so the JS
                   layer can route each row into the right slot of three
                   parallel arrays without any date arithmetic. */
                const rows = await sql<{
                    kind: "cur" | "prev" | "avg";
                    idx: number;
                    expense: string;
                    today_bucket: number;
                    period_length: number;
                }>`
                    WITH params AS (
                        SELECT ${anchor}::timestamptz AS anchor_ts
                    ),
                    bounds AS (
                        SELECT
                            date_trunc(${input.granularity}, anchor_ts) AS cur_start,
                            date_trunc(${input.granularity}, anchor_ts)
                                + ${sql.raw(`'${cfg.periodInterval}'::interval`)} AS cur_end,
                            date_trunc(${input.granularity}, anchor_ts)
                                - ${sql.raw(`'${cfg.periodInterval}'::interval`)} AS prev_start,
                            anchor_ts AS now_ts
                        FROM params
                    ),
                    scope_accounts AS (
                        SELECT account_id
                        FROM space_accounts
                        WHERE space_id = ${input.spaceId}
                    ),
                    /* Earliest period_start with any data in scope. Caps
                       generate_series so we don't spin up buckets back
                       to year zero when the user has only a few months
                       of history. NULL when the user has zero
                       transactions — handled via COALESCE below. */
                    data_start AS (
                        SELECT date_trunc(
                            ${input.granularity},
                            MIN(t.transaction_datetime)
                        ) AS earliest
                        FROM transactions t
                        WHERE (
                            t.source_account_id IN (SELECT account_id FROM scope_accounts)
                            OR t.destination_account_id IN (SELECT account_id FROM scope_accounts)
                        )
                    ),
                    history_start AS (
                        SELECT COALESCE(
                            (SELECT earliest FROM data_start),
                            (SELECT cur_start FROM bounds)
                        ) AS ts
                    ),
                    all_buckets AS (
                        SELECT generate_series(
                            (SELECT ts FROM history_start),
                            (SELECT cur_end FROM bounds)
                                - ${sql.raw(`'${cfg.bucketInterval}'::interval`)},
                            ${sql.raw(`'${cfg.bucketInterval}'::interval`)}
                        ) AS bucket_ts
                    ),
                    spend AS (
                        SELECT
                            date_trunc(${cfg.bucketUnit}, t.transaction_datetime) AS bucket_ts,
                            SUM(
                                CASE
                                    WHEN t.type = 'expense'
                                        AND t.source_account_id IN (SELECT account_id FROM scope_accounts) THEN t.amount
                                    WHEN t.type = 'transfer'
                                        AND t.source_account_id IN (SELECT account_id FROM scope_accounts)
                                        AND t.destination_account_id NOT IN (SELECT account_id FROM scope_accounts) THEN t.amount * ${xferFactor}
                                    ELSE 0
                                END
                            ) AS expense
                        FROM transactions t
                        WHERE t.transaction_datetime < (SELECT cur_end FROM bounds)
                          AND (
                              t.source_account_id IN (SELECT account_id FROM scope_accounts)
                              OR t.destination_account_id IN (SELECT account_id FROM scope_accounts)
                          )
                        GROUP BY 1
                    ),
                    classified AS (
                        SELECT
                            ab.bucket_ts,
                            COALESCE(s.expense, 0) AS expense,
                            CASE
                                WHEN ab.bucket_ts >= (SELECT cur_start FROM bounds) THEN 'cur'
                                WHEN ab.bucket_ts >= (SELECT prev_start FROM bounds) THEN 'prev'
                                ELSE 'avg'
                            END AS kind,
                            /* Bucket position within its own period.
                               Partitioning by date_trunc(granularity, …)
                               groups buckets that belong to the same
                               calendar period, so day-15-of-Aug,
                               day-15-of-Sep, etc. all land at idx=15. */
                            ROW_NUMBER() OVER (
                                PARTITION BY date_trunc(${input.granularity}, ab.bucket_ts)
                                ORDER BY ab.bucket_ts
                            )::int AS idx
                        FROM all_buckets ab
                        LEFT JOIN spend s ON s.bucket_ts = ab.bucket_ts
                    ),
                    meta AS (
                        SELECT
                            (SELECT COUNT(*)::int FROM all_buckets
                                WHERE bucket_ts >= (SELECT cur_start FROM bounds)
                                  AND bucket_ts <= (SELECT now_ts FROM bounds)
                            ) AS today_bucket,
                            (SELECT COUNT(*)::int FROM all_buckets
                                WHERE bucket_ts >= (SELECT cur_start FROM bounds)
                            ) AS period_length
                    )
                    SELECT
                        c.kind::text AS kind,
                        c.idx,
                        c.expense::text,
                        m.today_bucket,
                        m.period_length
                    FROM classified c
                    CROSS JOIN meta m
                    WHERE c.kind IN ('cur', 'prev')
                    UNION ALL
                    /* Per-position average across every prior period
                       the user has data for. */
                    SELECT
                        'avg'::text AS kind,
                        c.idx,
                        AVG(c.expense)::text AS expense,
                        m.today_bucket,
                        m.period_length
                    FROM classified c
                    CROSS JOIN meta m
                    WHERE c.kind = 'avg'
                    GROUP BY c.idx, m.today_bucket, m.period_length
                    ORDER BY 1, 2
                `.execute(trx);

                const first = rows.rows[0];
                const periodLength = first?.period_length ?? 1;
                const todayBucket = first?.today_bucket ?? 1;

                const current = new Array<number>(periodLength).fill(0);
                const previous = new Array<number>(periodLength).fill(0);
                const average = new Array<number>(periodLength).fill(0);
                let hasAverage = false;
                for (const r of rows.rows) {
                    const i = r.idx - 1;
                    if (i < 0 || i >= periodLength) continue;
                    if (r.kind === "cur") current[i] = Number(r.expense);
                    else if (r.kind === "prev") previous[i] = Number(r.expense);
                    else if (r.kind === "avg") {
                        average[i] = Number(r.expense);
                        hasAverage = true;
                    }
                }

                return {
                    granularity: input.granularity,
                    bucketUnit: cfg.bucketUnit,
                    bucketDays: cfg.bucketDays,
                    periodLength,
                    today: todayBucket,
                    current,
                    previous,
                    /* `null` when the user has no historical data
                       beyond the previous period — the frontend hides
                       the average line in that case. */
                    average: hasAverage ? average : null,
                };
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message ||
                    "Failed to compute trends daily comparison",
            });
        }
        return result;
    });
