import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

const granularitySchema = z.enum(["week", "month", "quarter", "year"]);
type Granularity = z.infer<typeof granularitySchema>;

/* See space-scoped procedure for why quarter uses day buckets. */
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
 * Personal twin of `analytics.trendsDailyComparison`. Same shape; scoped
 * to expenses out of the caller's owned accounts across every space they
 * are a member of. See the space-scoped procedure for the full
 * commentary on bounds-in-SQL and the per-position `average` field.
 */
export const personalTrendsDailyComparison = authorizedProcedure
    .input(
        z.object({
            anchor: z.coerce.date().optional(),
            granularity: granularitySchema.default("month"),
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

                const cfg = GRANULARITY_CONFIG[input.granularity];
                const anchor = input.anchor ?? new Date();

                const empty = {
                    granularity: input.granularity,
                    bucketUnit: cfg.bucketUnit,
                    bucketDays: cfg.bucketDays,
                    periodLength: 1,
                    today: 1,
                    current: [0],
                    previous: [0],
                    average: null as number[] | null,
                };
                if (owned.length === 0 || memberSpaces.length === 0)
                    return empty;

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
                    data_start AS (
                        SELECT date_trunc(
                            ${input.granularity},
                            MIN(t.transaction_datetime)
                        ) AS earliest
                        FROM transactions t
                        WHERE t.space_id = ANY(${memberSpaces})
                          AND (
                              t.source_account_id = ANY(${owned})
                              OR t.destination_account_id = ANY(${owned})
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
                        /* Spending = real consumption only. Transfers
                           between the user's owned accounts (or out to
                           accounts they don't own) are excluded — moving
                           money isn't spending. Transfer fees DO count
                           because the fee is money genuinely lost to a
                           provider. See engineering spec §"Spending vs
                           cash flow". */
                        SELECT
                            date_trunc(${cfg.bucketUnit}, t.transaction_datetime) AS bucket_ts,
                            SUM(
                                CASE
                                    WHEN t.type = 'expense'
                                        AND t.source_account_id = ANY(${owned}) THEN t.amount
                                    ELSE 0
                                END
                                + CASE
                                    WHEN t.type = 'transfer'
                                        AND t.source_account_id = ANY(${owned})
                                        AND t.fee_amount IS NOT NULL THEN t.fee_amount
                                    ELSE 0
                                END
                            ) AS expense
                        FROM transactions t
                        WHERE t.space_id = ANY(${memberSpaces})
                          AND t.transaction_datetime < (SELECT cur_end FROM bounds)
                          AND t.source_account_id = ANY(${owned})
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
                `.execute(ctx.services.qb);

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
                    average: hasAverage ? average : null,
                };
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message ||
                    "Failed to compute personal trends daily comparison",
            });
        }
        return result;
    });
