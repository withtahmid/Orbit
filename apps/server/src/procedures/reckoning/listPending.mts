import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Past-month overspends that the current user hasn't acknowledged yet.
 *
 * Returns one row per (envelope, period) where:
 *   1. The period is a completed past calendar month for a monthly envelope
 *      (so it has settled — we don't reckon mid-month).
 *   2. consumed > allocated for that period (true overspend, not just a
 *      partition or carry edge case).
 *   3. No matching row exists in reckoning_acknowledgments for the current
 *      user (so once a user acknowledges, the entry disappears for them
 *      but stays for other space members until they too resolve it).
 *
 * The lookback window defaults to 90 days so we never haunt users with
 * ancient unresolved months — practically anything older than a quarter
 * isn't worth their decision time. They can still see the data via the
 * annual view if they care.
 */
export const listPendingReckoning = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            lookbackDays: z.number().int().min(1).max(365).default(90),
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

                const now = new Date();
                const lookbackStart = new Date(
                    now.getTime() - input.lookbackDays * 86_400_000
                );
                const currentMonthStart = new Date(
                    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
                );

                const rows = await sql<{
                    envelop_id: string;
                    name: string;
                    color: string;
                    icon: string;
                    period_start: string;
                    allocated: string;
                    consumed: string;
                }>`
                    WITH months AS (
                        SELECT generate_series(
                            DATE_TRUNC('month', ${lookbackStart}::timestamp),
                            DATE_TRUNC('month', ${currentMonthStart}::timestamp) - INTERVAL '1 day',
                            INTERVAL '1 month'
                        ) AS m_start
                    ),
                    candidate AS (
                        SELECT
                            e.id AS envelop_id,
                            e.name,
                            e.color,
                            e.icon,
                            m.m_start::date AS period_start,
                            COALESCE((
                                SELECT SUM(a.amount)
                                FROM envelop_allocations a
                                WHERE a.envelop_id = e.id
                                  AND COALESCE(
                                        a.period_start,
                                        DATE_TRUNC('month', a.created_at)::date
                                      ) = m.m_start::date
                            ), 0) AS allocated,
                            -- Consumption must include transfer fees that
                            -- roll up to this envelope's category, otherwise
                            -- a fee-only overspend would never appear here
                            -- and the strict-mode gate could be bypassed by
                            -- routing spend through transfer fees. Mirrors
                            -- the analytics.envelopeUtilization formula.
                            COALESCE((
                                SELECT SUM(entry.amount) FROM (
                                    SELECT t.amount
                                    FROM transactions t
                                    JOIN expense_categories ec ON ec.id = t.expense_category_id
                                    WHERE ec.envelop_id = e.id
                                      AND t.type = 'expense'
                                      AND t.transaction_datetime >= m.m_start
                                      AND t.transaction_datetime < (m.m_start + INTERVAL '1 month')
                                    UNION ALL
                                    SELECT t.fee_amount AS amount
                                    FROM transactions t
                                    JOIN expense_categories ec ON ec.id = t.fee_expense_category_id
                                    WHERE ec.envelop_id = e.id
                                      AND t.type = 'transfer'
                                      AND t.fee_amount IS NOT NULL
                                      AND t.transaction_datetime >= m.m_start
                                      AND t.transaction_datetime < (m.m_start + INTERVAL '1 month')
                                ) entry
                            ), 0) AS consumed
                        FROM envelops e
                        CROSS JOIN months m
                        WHERE e.space_id = ${input.spaceId}
                          AND e.cadence = 'monthly'
                          AND e.archived = false
                          AND (m.m_start + INTERVAL '1 month') <= ${currentMonthStart}
                    )
                    SELECT envelop_id::text, name, color, icon,
                           period_start::text, allocated::text, consumed::text
                    FROM candidate c
                    WHERE consumed > allocated
                      AND NOT EXISTS (
                          SELECT 1 FROM reckoning_acknowledgments r
                          WHERE r.space_id = ${input.spaceId}
                            AND r.envelop_id = c.envelop_id
                            AND r.user_id = ${ctx.auth.user.id}
                            AND r.period_start = c.period_start
                      )
                    ORDER BY period_start ASC, name ASC
                `
                    .execute(trx)
                    .then((r) => r.rows);

                return rows.map((r) => ({
                    envelopId: r.envelop_id,
                    name: r.name,
                    color: r.color,
                    icon: r.icon,
                    periodStart: r.period_start,
                    allocated: Number(r.allocated),
                    consumed: Number(r.consumed),
                    overBy: Number(r.consumed) - Number(r.allocated),
                }));
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to list pending reckoning",
            });
        }
        return result ?? [];
    });
