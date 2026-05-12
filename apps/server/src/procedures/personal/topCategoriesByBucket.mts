import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

export const personalTopCategoriesByBucket = authorizedProcedure
    .input(
        z.object({
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            bucket: z.enum(["day", "week", "month"]).default("month"),
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

                const buckets = await sql<{ bucket: Date }>`
                    SELECT generate_series(
                        date_trunc(${input.bucket}, ${input.periodStart}::timestamptz),
                        date_trunc(${input.bucket}, ${input.periodEnd}::timestamptz),
                        ${sql.raw(`'${interval}'::interval`)}
                    ) AS bucket
                `.execute(ctx.services.qb);
                if (owned.length === 0 || memberSpaces.length === 0) {
                    return buckets.rows.map((b) => ({
                        bucket: new Date(b.bucket),
                        top: null as null | {
                            categoryId: string;
                            name: string;
                            color: string;
                            icon: string;
                            total: number;
                        },
                    }));
                }

                const rows = await sql<{
                    bucket: Date;
                    id: string | null;
                    name: string | null;
                    color: string | null;
                    icon: string | null;
                    total: string;
                }>`
                    WITH spending AS (
                        SELECT
                            date_trunc(${input.bucket}, transaction_datetime) AS bucket,
                            expense_category_id AS category_id,
                            amount
                        FROM transactions
                        WHERE type = 'expense'
                          AND space_id = ANY(${memberSpaces})
                          AND source_account_id = ANY(${owned})
                          AND expense_category_id IS NOT NULL
                          AND transaction_datetime >= ${input.periodStart}
                          AND transaction_datetime < ${input.periodEnd}
                    ),
                    rolled AS (
                        SELECT bucket, category_id, SUM(amount) AS total
                        FROM spending
                        GROUP BY bucket, category_id
                    ),
                    ranked AS (
                        SELECT
                            bucket,
                            category_id,
                            total,
                            ROW_NUMBER() OVER (
                                PARTITION BY bucket
                                ORDER BY total DESC, category_id ASC
                            ) AS rk
                        FROM rolled
                    ),
                    buckets AS (
                        SELECT generate_series(
                            date_trunc(${input.bucket}, ${input.periodStart}::timestamptz),
                            date_trunc(${input.bucket}, ${input.periodEnd}::timestamptz),
                            ${sql.raw(`'${interval}'::interval`)}
                        ) AS bucket
                    )
                    SELECT
                        b.bucket::timestamptz AS bucket,
                        ec.id::text AS id,
                        ec.name,
                        ec.color,
                        ec.icon,
                        COALESCE(r.total, 0)::text AS total
                    FROM buckets b
                    LEFT JOIN ranked r ON r.bucket = b.bucket AND r.rk = 1
                    LEFT JOIN expense_categories ec ON ec.id = r.category_id
                    ORDER BY b.bucket ASC
                `.execute(ctx.services.qb);

                return rows.rows.map((r) => ({
                    bucket: new Date(r.bucket),
                    top: r.id
                        ? {
                              categoryId: r.id,
                              name: r.name as string,
                              color: r.color as string,
                              icon: r.icon as string,
                              total: Number(r.total),
                          }
                        : null,
                }));
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message ||
                    "Failed to compute personal top categories by bucket",
            });
        }
        return result;
    });
