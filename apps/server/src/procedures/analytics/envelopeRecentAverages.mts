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
 * Calendar-month bucketing is hardcoded — consumers are the monthly plan
 * UI and the envelope detail page's "Last month" / "3-month avg" KPIs,
 * so per-bucket flexibility isn't worth the surface.
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
                // it: [ref - 3 months, ref). Month bucketing happens in
                // SQL below via date_trunc on the Asia/Dhaka DB session —
                // deriving calendar fields from `ref` with native UTC
                // getters would silently shift the bucket back a month
                // (Dhaka is UTC+6, so APP_TZ midnight on the 1st is
                // 18:00 UTC the day before).
                //
                // Cast the bound parameter to `::timestamptz` (not
                // straight to `::date`) before truncating — casting an
                // untyped bound parameter directly to `date` parses only
                // the literal calendar-date substring and ignores the
                // session TimeZone entirely, silently reintroducing the
                // exact same one-month-early drift this comment warns
                // about. Going through `timestamptz` first makes
                // `date_trunc` apply the Asia/Dhaka session zone.
                const ref = input.referenceDate ?? new Date();

                const rows = await sql<{
                    envelop_id: string;
                    last_month_spend: string;
                    last_month_planned: string;
                    three_month_total_spend: string;
                }>`
                    WITH bounds AS (
                        SELECT
                            date_trunc('month', ${ref}::timestamptz)::date AS ref_month,
                            (date_trunc('month', ${ref}::timestamptz) - interval '1 month')::date AS last_month_start,
                            (date_trunc('month', ${ref}::timestamptz) - interval '3 month')::date AS three_months_ago
                    )
                    SELECT
                        e.id::text AS envelop_id,
                        COALESCE((
                            SELECT SUM(t.amount)
                            FROM transactions t
                            WHERE t.envelop_id = e.id
                              AND t.type = 'expense'
                              AND t.transaction_datetime >= b.last_month_start
                              AND t.transaction_datetime < b.ref_month
                        ), 0)::text AS last_month_spend,
                        COALESCE((
                            SELECT SUM(a.amount)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = e.id
                              AND a.period_start = b.last_month_start
                        ), 0)::text AS last_month_planned,
                        COALESCE((
                            SELECT SUM(t.amount)
                            FROM transactions t
                            WHERE t.envelop_id = e.id
                              AND t.type = 'expense'
                              AND t.transaction_datetime >= b.three_months_ago
                              AND t.transaction_datetime < b.ref_month
                        ), 0)::text AS three_month_total_spend
                    FROM envelops e
                    CROSS JOIN bounds b
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
