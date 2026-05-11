import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

/**
 * Cross-space pending reckoning list. Same selection logic as
 * reckoning.listPending but spans every space the caller is a member of.
 * Each row carries `spaceId` + `spaceName` so the personal reckoning UI
 * can group / disambiguate.
 */
export const personalReckoningListPending = authorizedProcedure
    .input(
        z.object({
            lookbackDays: z.number().int().min(1).max(365).default(90),
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

                // Restrict consumption to the caller's owned accounts —
                // matches the semantics of the personal envelope view, so
                // an overspend that's actually a co-member's spending
                // doesn't end up on this user's reckoning queue.
                const owned = await resolveOwnedAccountIds(
                    trx,
                    ctx.auth.user.id
                );
                const ownedParam =
                    owned.length === 0
                        ? ["00000000-0000-0000-0000-000000000000"]
                        : owned;

                const now = new Date();
                const lookbackStart = new Date(
                    now.getTime() - input.lookbackDays * 86_400_000
                );
                const currentMonthStart = new Date(
                    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
                );

                const rows = await sql<{
                    space_id: string;
                    space_name: string;
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
                            e.space_id,
                            s.name AS space_name,
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
                            -- Consumption includes transfer fees rolling
                            -- up to this envelope (matches the analytics
                            -- formula); also restricted to owned-source
                            -- transactions for personal-slice scoping.
                            COALESCE((
                                SELECT SUM(entry.amount) FROM (
                                    SELECT t.amount
                                    FROM transactions t
                                    JOIN expense_categories ec ON ec.id = t.expense_category_id
                                    WHERE ec.envelop_id = e.id
                                      AND t.type = 'expense'
                                      AND t.source_account_id = ANY(${ownedParam}::uuid[])
                                      AND t.transaction_datetime >= m.m_start
                                      AND t.transaction_datetime < (m.m_start + INTERVAL '1 month')
                                    UNION ALL
                                    SELECT t.fee_amount AS amount
                                    FROM transactions t
                                    JOIN expense_categories ec ON ec.id = t.fee_expense_category_id
                                    WHERE ec.envelop_id = e.id
                                      AND t.type = 'transfer'
                                      AND t.fee_amount IS NOT NULL
                                      AND t.source_account_id = ANY(${ownedParam}::uuid[])
                                      AND t.transaction_datetime >= m.m_start
                                      AND t.transaction_datetime < (m.m_start + INTERVAL '1 month')
                                ) entry
                            ), 0) AS consumed
                        FROM envelops e
                        JOIN spaces s ON s.id = e.space_id
                        CROSS JOIN months m
                        WHERE e.space_id = ANY(${memberSpaces}::uuid[])
                          AND e.cadence = 'monthly'
                          AND e.archived = false
                          AND (m.m_start + INTERVAL '1 month') <= ${currentMonthStart}
                    )
                    SELECT space_id::text, space_name, envelop_id::text, name, color, icon,
                           period_start::text, allocated::text, consumed::text
                    FROM candidate c
                    WHERE consumed > allocated
                      AND NOT EXISTS (
                          SELECT 1 FROM reckoning_acknowledgments r
                          WHERE r.space_id = c.space_id
                            AND r.envelop_id = c.envelop_id
                            AND r.user_id = ${ctx.auth.user.id}
                            AND r.period_start = c.period_start
                      )
                    ORDER BY period_start ASC, space_name ASC, name ASC
                `
                    .execute(trx)
                    .then((r) => r.rows);

                return rows.map((r) => ({
                    spaceId: r.space_id,
                    spaceName: r.space_name,
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
                message:
                    error.message ||
                    "Failed to list personal pending reckoning",
            });
        }
        return result ?? [];
    });
