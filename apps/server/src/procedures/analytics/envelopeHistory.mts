import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Per-bucket allocated and consumed totals for a single envelope. Powers
 * the EnvelopeDetailPage trend bars (default: 6 buckets at month
 * granularity). Allocations are bucketed by their effective period_start
 * (or by created_at for cadence='none'); consumption is bucketed by
 * transaction date over the envelope's expense categories (and any
 * transfer fee categories that roll up to it).
 */
export const envelopeHistory = authorizedProcedure
    .input(
        z.object({
            envelopId: z.string().uuid(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            bucket: z.enum(["day", "week", "month", "year"]).default("month"),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const env = await trx
                    .selectFrom("envelops")
                    .where("id", "=", input.envelopId)
                    .select(["id", "space_id"])
                    .executeTakeFirst();
                if (!env) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Envelope not found",
                    });
                }
                await resolveSpaceMembership({
                    trx,
                    spaceId: env.space_id,
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
                    allocated: string;
                    consumed: string;
                }>`
                    WITH buckets AS (
                        SELECT generate_series(
                            date_trunc(${input.bucket}, ${input.periodStart}::timestamptz),
                            date_trunc(${input.bucket}, ${input.periodEnd}::timestamptz),
                            ${sql.raw(`'${interval}'::interval`)}
                        ) AS bucket
                    ),
                    alloc AS (
                        SELECT
                            date_trunc(
                                ${input.bucket},
                                COALESCE(period_start, DATE_TRUNC('month', created_at)::date)::timestamptz
                            ) AS bucket,
                            SUM(amount) AS amount
                        FROM envelop_allocations
                        WHERE envelop_id = ${input.envelopId}
                          AND COALESCE(period_start, DATE_TRUNC('month', created_at)::date)
                              >= ${input.periodStart}::date
                          AND COALESCE(period_start, DATE_TRUNC('month', created_at)::date)
                              < ${input.periodEnd}::date
                        GROUP BY 1
                    ),
                    spend AS (
                        SELECT
                            date_trunc(${input.bucket}, dt) AS bucket,
                            SUM(amount) AS amount
                        FROM (
                            SELECT t.transaction_datetime AS dt, t.amount
                            FROM transactions t
                            JOIN expense_categories ec ON ec.id = t.expense_category_id
                            WHERE ec.envelop_id = ${input.envelopId}
                              AND t.type = 'expense'
                              AND t.transaction_datetime >= ${input.periodStart}
                              AND t.transaction_datetime < ${input.periodEnd}
                            UNION ALL
                            SELECT t.transaction_datetime AS dt, t.fee_amount
                            FROM transactions t
                            JOIN expense_categories ec ON ec.id = t.fee_expense_category_id
                            WHERE ec.envelop_id = ${input.envelopId}
                              AND t.type = 'transfer'
                              AND t.fee_amount IS NOT NULL
                              AND t.transaction_datetime >= ${input.periodStart}
                              AND t.transaction_datetime < ${input.periodEnd}
                        ) e
                        GROUP BY 1
                    )
                    SELECT
                        b.bucket::timestamptz AS bucket,
                        COALESCE(a.amount, 0)::text AS allocated,
                        COALESCE(s.amount, 0)::text AS consumed
                    FROM buckets b
                    LEFT JOIN alloc a ON a.bucket = b.bucket
                    LEFT JOIN spend s ON s.bucket = b.bucket
                    ORDER BY b.bucket ASC
                `.execute(trx);

                return rows.rows.map((r) => ({
                    bucket: new Date(r.bucket),
                    allocated: Number(r.allocated),
                    consumed: Number(r.consumed),
                }));
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message || "Failed to compute envelope history",
            });
        }
        return result;
    });
