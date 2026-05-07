import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Top expense merchants for the window with delta vs the immediately-
 * preceding window of equal length. Merchant key = trimmed lowercased
 * description (same normalization as the recurring detector — keep them
 * in sync so a "merchant" feels like one thing across surfaces).
 *
 * Display name is the most-recent original-cased description seen for
 * the group, so the case the user typed is what the UI shows.
 */
export const topMerchants = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            limit: z.number().int().min(1).max(50).default(6),
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

                const durationMs =
                    input.periodEnd.getTime() - input.periodStart.getTime();
                const prevStart = new Date(
                    input.periodStart.getTime() - durationMs
                );

                const rows = await sql<{
                    merchant_key: string;
                    merchant: string;
                    cur_total: string;
                    prv_total: string;
                    cur_count: string;
                }>`
                    WITH scope_accounts AS (
                        SELECT account_id
                        FROM space_accounts
                        WHERE space_id = ${input.spaceId}
                    ),
                    spending AS (
                        SELECT
                            LOWER(TRIM(COALESCE(t.description, ''))) AS merchant_key,
                            t.description AS merchant,
                            t.amount,
                            t.transaction_datetime AS dt
                        FROM transactions t
                        WHERE t.type = 'expense'
                          AND t.source_account_id IN (SELECT account_id FROM scope_accounts)
                          AND t.description IS NOT NULL
                          AND TRIM(t.description) <> ''
                          AND t.transaction_datetime >= ${prevStart}
                          AND t.transaction_datetime < ${input.periodEnd}
                    )
                    SELECT
                        merchant_key,
                        (ARRAY_AGG(merchant ORDER BY dt DESC))[1] AS merchant,
                        COALESCE(SUM(CASE WHEN dt >= ${input.periodStart} THEN amount ELSE 0 END), 0)::text AS cur_total,
                        COALESCE(SUM(CASE WHEN dt < ${input.periodStart} THEN amount ELSE 0 END), 0)::text AS prv_total,
                        SUM(CASE WHEN dt >= ${input.periodStart} THEN 1 ELSE 0 END)::text AS cur_count
                    FROM spending
                    GROUP BY merchant_key
                    HAVING SUM(CASE WHEN dt >= ${input.periodStart} THEN amount ELSE 0 END) > 0
                    ORDER BY SUM(CASE WHEN dt >= ${input.periodStart} THEN amount ELSE 0 END) DESC
                    LIMIT ${input.limit}
                `.execute(trx);

                return rows.rows.map((r) => {
                    const cur = Number(r.cur_total);
                    const prv = Number(r.prv_total);
                    const deltaPct =
                        prv === 0
                            ? cur > 0
                                ? 1
                                : 0
                            : (cur - prv) / prv;
                    return {
                        merchant: r.merchant,
                        merchantKey: r.merchant_key,
                        total: cur,
                        previousTotal: prv,
                        count: Number(r.cur_count),
                        deltaPct,
                    };
                });
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute top merchants",
            });
        }
        return result;
    });
