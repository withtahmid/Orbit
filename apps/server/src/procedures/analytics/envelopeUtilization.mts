import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Per-envelope utilization for the given period window. Returns one row per
 * envelope with a `breakdown` array of per-account partition numbers. When
 * callers don't pass explicit period_start/period_end we use a large
 * enough window so cadence='none' envelopes include everything and monthly
 * envelopes still compute correctly on their own windows.
 *
 * For cadence='none' envelopes, allocations ignore period_start entirely.
 * For cadence='monthly' envelopes, only allocations whose effective
 * period_start falls in the requested window are counted.
 */
export const envelopeUtilization = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            periodStart: z.coerce.date().optional(),
            periodEnd: z.coerce.date().optional(),
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

                const periodStart = input.periodStart ?? new Date("1970-01-01");
                const periodEnd = input.periodEnd ?? new Date("9999-12-31");

                // Envelope totals for the window
                const totalsQuery = sql<{
                    envelop_id: string;
                    name: string;
                    color: string;
                    icon: string;
                    description: string | null;
                    cadence: string;
                    carry_over: boolean;
                    allocated: string;
                    consumed: string;
                }>`
                    SELECT
                        e.id::text AS envelop_id,
                        e.name,
                        e.color,
                        e.icon,
                        e.description,
                        e.cadence,
                        e.carry_over,
                        COALESCE((
                            SELECT SUM(a.amount)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = e.id
                              AND (
                                  e.cadence = 'none'
                                  OR (
                                      COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= ${periodStart}::date
                                      AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < ${periodEnd}::date
                                  )
                              )
                        ), 0)::text AS allocated,
                        COALESCE((
                            SELECT SUM(t.amount)
                            FROM transactions t
                            JOIN expense_categories ec ON ec.id = t.expense_category_id
                            WHERE ec.envelop_id = e.id
                              AND t.type = 'expense'
                              AND t.transaction_datetime >= ${periodStart}
                              AND t.transaction_datetime < ${periodEnd}
                        ), 0)::text AS consumed
                    FROM envelops e
                    WHERE e.space_id = ${input.spaceId}
                    ORDER BY e.created_at ASC
                `;
                const totals = (await totalsQuery.execute(trx)).rows;

                // Per-(envelope, account) breakdown for the same window
                const breakdownQuery = sql<{
                    envelop_id: string;
                    account_id: string | null;
                    allocated: string;
                    consumed: string;
                }>`
                    WITH alloc AS (
                        SELECT a.envelop_id,
                               a.account_id,
                               SUM(a.amount) AS amount
                        FROM envelop_allocations a
                        JOIN envelops e ON e.id = a.envelop_id
                        WHERE e.space_id = ${input.spaceId}
                          AND (
                              e.cadence = 'none'
                              OR (
                                  COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= ${periodStart}::date
                                  AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < ${periodEnd}::date
                              )
                          )
                        GROUP BY a.envelop_id, a.account_id
                    ),
                    spend AS (
                        SELECT ec.envelop_id,
                               t.source_account_id AS account_id,
                               SUM(t.amount) AS amount
                        FROM transactions t
                        JOIN expense_categories ec ON ec.id = t.expense_category_id
                        WHERE ec.space_id = ${input.spaceId}
                          AND t.type = 'expense'
                          AND t.transaction_datetime >= ${periodStart}
                          AND t.transaction_datetime < ${periodEnd}
                        GROUP BY ec.envelop_id, t.source_account_id
                    )
                    SELECT
                        COALESCE(alloc.envelop_id, spend.envelop_id)::text AS envelop_id,
                        COALESCE(alloc.account_id, spend.account_id)::text AS account_id,
                        COALESCE(alloc.amount, 0)::text AS allocated,
                        COALESCE(spend.amount, 0)::text AS consumed
                    FROM alloc
                    FULL OUTER JOIN spend
                      ON alloc.envelop_id = spend.envelop_id
                     AND alloc.account_id IS NOT DISTINCT FROM spend.account_id
                `;
                const breakdown = (await breakdownQuery.execute(trx)).rows;

                const breakdownByEnvelope = new Map<
                    string,
                    Array<{
                        accountId: string | null;
                        allocated: number;
                        consumed: number;
                        remaining: number;
                        isDrift: boolean;
                    }>
                >();
                for (const r of breakdown) {
                    const allocated = Number(r.allocated);
                    const consumed = Number(r.consumed);
                    const remaining = allocated - consumed;
                    const row = {
                        accountId: r.account_id,
                        allocated,
                        consumed,
                        remaining,
                        isDrift: remaining < 0,
                    };
                    const arr = breakdownByEnvelope.get(r.envelop_id) ?? [];
                    arr.push(row);
                    breakdownByEnvelope.set(r.envelop_id, arr);
                }

                return totals.map((t) => {
                    const allocated = Number(t.allocated);
                    const consumed = Number(t.consumed);
                    return {
                        envelopId: t.envelop_id,
                        name: t.name,
                        color: t.color,
                        icon: t.icon,
                        description: t.description,
                        cadence: t.cadence as "none" | "monthly",
                        carryOver: t.carry_over,
                        allocated,
                        consumed,
                        remaining: allocated - consumed,
                        breakdown: breakdownByEnvelope.get(t.envelop_id) ?? [],
                    };
                });
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute envelope utilization",
            });
        }
        return result;
    });
