import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Per-envelope coaching context for the Plan-this-month page:
 *   - lastMonthSpend / lastMonthPlanned: the immediately-prior period's
 *     numbers, so the row can show "spent $X of $Y last month".
 *   - avg3MonthSpend: rolling average of the last three completed
 *     calendar months. Drives the "you're underplanning" hint when the
 *     proposed plan is meaningfully below historical reality.
 *
 * Calendar-month bucketing is hardcoded — the only consumer is the
 * monthly plan UI, so per-bucket flexibility isn't worth the surface.
 */
export const envelopeRecentAverages = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            referenceDate: z.coerce.date().optional(),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: [
                        "owner",
                        "editor",
                        "viewer",
                    ] as unknown as SpaceMembers["role"][],
                });

                // Reference is the START of the period being planned. We
                // look at the THREE completed months immediately before
                // it: [ref - 3 months, ref).
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
                            JOIN expense_categories ec ON ec.id = t.expense_category_id
                            WHERE ec.envelop_id = e.id
                              AND t.type = 'expense'
                              AND t.transaction_datetime >= ${lastMonthStart}
                              AND t.transaction_datetime < ${refUtc}
                        ), 0)::text AS last_month_spend,
                        COALESCE((
                            SELECT SUM(a.amount)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = e.id
                              AND COALESCE(
                                    a.period_start,
                                    DATE_TRUNC('month', a.created_at)::date
                                  ) = ${lastMonthStart}::date
                        ), 0)::text AS last_month_planned,
                        COALESCE((
                            SELECT SUM(t.amount)
                            FROM transactions t
                            JOIN expense_categories ec ON ec.id = t.expense_category_id
                            WHERE ec.envelop_id = e.id
                              AND t.type = 'expense'
                              AND t.transaction_datetime >= ${threeMonthsAgo}
                              AND t.transaction_datetime < ${refUtc}
                        ), 0)::text AS three_month_total_spend
                    FROM envelops e
                    WHERE e.space_id = ${input.spaceId}
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
                    "Failed to compute envelope recent averages",
            });
        }
        return result ?? [];
    });
