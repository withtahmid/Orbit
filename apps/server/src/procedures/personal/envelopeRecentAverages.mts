import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

/**
 * Cross-space coaching context for the personal Plan-this-month surface.
 * Returns one row per envelope across every member space, with the
 * canonical last-month + 3-month-average numbers.
 */
export const personalEnvelopeRecentAverages = authorizedProcedure
    .input(
        z.object({
            referenceDate: z.coerce.date().optional(),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const memberSpaces = await resolveMemberSpaceIds(
                    trx,
                    ctx.auth.user.id
                );
                if (memberSpaces.length === 0) return [];

                // Spend totals must reflect the caller's accounts only —
                // otherwise the personal coaching averages drift toward
                // household consumption on shared spaces.
                const owned = await resolveOwnedAccountIds(
                    trx,
                    ctx.auth.user.id
                );
                const ownedParam =
                    owned.length === 0
                        ? ["00000000-0000-0000-0000-000000000000"]
                        : owned;

                const ref =
                    input.referenceDate ??
                    new Date(
                        Date.UTC(
                            new Date().getUTCFullYear(),
                            new Date().getUTCMonth(),
                            1
                        )
                    );
                const refUtc = new Date(
                    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1)
                );
                const lastMonthStart = new Date(
                    Date.UTC(
                        refUtc.getUTCFullYear(),
                        refUtc.getUTCMonth() - 1,
                        1
                    )
                );
                const threeMonthsAgo = new Date(
                    Date.UTC(
                        refUtc.getUTCFullYear(),
                        refUtc.getUTCMonth() - 3,
                        1
                    )
                );

                const rows = await sql<{
                    envelop_id: string;
                    last_month_spend: string;
                    last_month_planned: string;
                    three_month_total_spend: string;
                }>`
                    SELECT
                        e.id::text AS envelop_id,
                        COALESCE((
                            SELECT SUM(t.amount)
                            FROM transactions t
                            WHERE t.envelop_id = e.id
                              AND t.type = 'expense'
                              AND t.source_account_id = ANY(${ownedParam}::uuid[])
                              AND t.transaction_datetime >= ${lastMonthStart}
                              AND t.transaction_datetime < ${refUtc}
                        ), 0)::text AS last_month_spend,
                        -- Planned matches the personal allocation
                        -- scoping: NULL allocations (new space-wide flow)
                        -- count once; legacy account-pinned rows count
                        -- only when pinned to an owned account. Keeps
                        -- "you spent X / planned Y" comparing apples to
                        -- apples — both numbers are personal-slice.
                        COALESCE((
                            SELECT SUM(a.amount)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = e.id
                              AND (a.account_id IS NULL OR a.account_id = ANY(${ownedParam}::uuid[]))
                              AND COALESCE(
                                    a.period_start,
                                    DATE_TRUNC('month', a.created_at)::date
                                  ) = ${lastMonthStart}::date
                        ), 0)::text AS last_month_planned,
                        COALESCE((
                            SELECT SUM(t.amount)
                            FROM transactions t
                            WHERE t.envelop_id = e.id
                              AND t.type = 'expense'
                              AND t.source_account_id = ANY(${ownedParam}::uuid[])
                              AND t.transaction_datetime >= ${threeMonthsAgo}
                              AND t.transaction_datetime < ${refUtc}
                        ), 0)::text AS three_month_total_spend
                    FROM envelops e
                    WHERE e.space_id = ANY(${memberSpaces}::uuid[])
                `
                    .execute(trx)
                    .then((r) => r.rows);

                return rows.map((r) => ({
                    envelopId: r.envelop_id,
                    lastMonthSpend: Number(r.last_month_spend),
                    lastMonthPlanned: Number(r.last_month_planned),
                    avg3MonthSpend: Number(r.three_month_total_spend) / 3,
                }));
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message ||
                    "Failed to compute personal envelope recent averages",
            });
        }
        return result ?? [];
    });
