import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

export const personalIncomeBreakdown = authorizedProcedure
    .input(
        z.object({
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
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

                const rows = await sql<{
                    source: string;
                    amount: string;
                    count: string;
                }>`
                    WITH inflow AS (
                        SELECT
                            COALESCE(NULLIF(TRIM(t.description), ''), 'Other') AS source_raw,
                            t.amount
                        FROM transactions t
                        WHERE t.space_id = ANY(${memberSpaces})
                          AND t.transaction_datetime >= ${input.periodStart}
                          AND t.transaction_datetime < ${input.periodEnd}
                          AND (
                              (t.type = 'income'
                                  AND t.destination_account_id = ANY(${owned}))
                              OR (t.type = 'transfer'
                                  AND t.destination_account_id = ANY(${owned})
                                  AND t.source_account_id <> ALL(${owned}))
                              OR (t.type = 'adjustment'
                                  AND t.destination_account_id = ANY(${owned}))
                          )
                    )
                    SELECT
                        INITCAP(LOWER(source_raw)) AS source,
                        SUM(amount)::text AS amount,
                        COUNT(*)::text AS count
                    FROM inflow
                    GROUP BY INITCAP(LOWER(source_raw))
                    ORDER BY SUM(amount) DESC
                `.execute(ctx.services.qb);

                return rows.rows.map((r) => ({
                    source: r.source,
                    amount: Number(r.amount),
                    count: Number(r.count),
                }));
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message ||
                    "Failed to compute personal income breakdown",
            });
        }
        return result;
    });
