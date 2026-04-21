import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const cashFlow = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            bucket: z.enum(["day", "week", "month"]).default("month"),
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

                const query = sql<{
                    bucket: Date;
                    income: string;
                    expense: string;
                }>`
                    WITH buckets AS (
                        SELECT generate_series(
                            date_trunc(${input.bucket}, ${input.periodStart}::timestamptz),
                            date_trunc(${input.bucket}, ${input.periodEnd}::timestamptz),
                            ${sql.raw(`'${interval}'::interval`)}
                        ) AS bucket
                    ),
                    deltas AS (
                        SELECT
                            date_trunc(${input.bucket}, transaction_datetime) AS bucket,
                            SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
                            -- Transfer fees count as expense (money leaving
                            -- the space to the bank/processor) alongside
                            -- regular expense transactions.
                            SUM(
                                CASE WHEN type = 'expense' THEN amount ELSE 0 END
                                + CASE WHEN type = 'transfer' AND fee_amount IS NOT NULL THEN fee_amount ELSE 0 END
                            ) AS expense
                        FROM transactions
                        WHERE space_id = ${input.spaceId}
                          AND transaction_datetime >= ${input.periodStart}
                          AND transaction_datetime < ${input.periodEnd}
                        GROUP BY 1
                    )
                    SELECT
                        b.bucket::timestamptz AS bucket,
                        COALESCE(d.income, 0)::text AS income,
                        COALESCE(d.expense, 0)::text AS expense
                    FROM buckets b
                    LEFT JOIN deltas d ON d.bucket = b.bucket
                    ORDER BY b.bucket ASC
                `;
                const res = await query.execute(trx);
                return res.rows.map((r) => ({
                    bucket: new Date(r.bucket),
                    income: Number(r.income),
                    expense: Number(r.expense),
                    net: Number(r.income) - Number(r.expense),
                }));
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute cash flow",
            });
        }
        return result;
    });
