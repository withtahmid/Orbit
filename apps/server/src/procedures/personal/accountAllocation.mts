import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveOwnedAccountIds } from "./shared.mjs";

/**
 * Per-account allocation view for one of the caller's owned accounts.
 * Unlike analytics.accountAllocation, there is no `spaceId` — the
 * account's allocations are unioned across every space it's shared
 * into. Envelope partitions still pull the per-envelope cadence from
 * that envelope's home space, so the period semantics match each
 * underlying envelope.
 */
export const personalAccountAllocation = authorizedProcedure
    .input(z.object({ accountId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            (async () => {
                const owned = await resolveOwnedAccountIds(
                    ctx.services.qb,
                    ctx.auth.user.id
                );
                if (!owned.includes(input.accountId)) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "You don't own this account",
                    });
                }

                const envelopesRows = await sql<{
                    envelop_id: string;
                    space_id: string;
                    space_name: string;
                    name: string;
                    color: string;
                    icon: string;
                    cadence: string;
                    carry_over: boolean;
                    allocated: string;
                    consumed: string;
                    carry_in: string;
                }>`
                    WITH period AS (
                        SELECT
                            e.id AS envelop_id,
                            e.space_id,
                            e.name, e.color, e.icon, e.cadence, e.carry_over,
                            CASE e.cadence
                                WHEN 'none' THEN DATE '1970-01-01'
                                WHEN 'monthly' THEN DATE_TRUNC('month', NOW())::date
                            END AS p_start,
                            CASE e.cadence
                                WHEN 'none' THEN DATE '9999-12-31'
                                WHEN 'monthly' THEN (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::date
                            END AS p_end,
                            CASE e.cadence
                                WHEN 'monthly' THEN (DATE_TRUNC('month', NOW()) - INTERVAL '1 month')::date
                                ELSE NULL
                            END AS prev_start,
                            CASE e.cadence
                                WHEN 'monthly' THEN DATE_TRUNC('month', NOW())::date
                                ELSE NULL
                            END AS prev_end
                        FROM envelops e
                    )
                    SELECT
                        p.envelop_id::text AS envelop_id,
                        p.space_id::text AS space_id,
                        s.name AS space_name,
                        p.name, p.color, p.icon, p.cadence, p.carry_over,
                        COALESCE((
                            SELECT SUM(a.amount)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = p.envelop_id
                              AND a.account_id = ${input.accountId}
                              AND (
                                  p.cadence = 'none'
                                  OR (
                                      COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= p.p_start
                                      AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < p.p_end
                                  )
                              )
                        ), 0)::text AS allocated,
                        COALESCE((
                            SELECT SUM(entry.amount) FROM (
                                SELECT t.amount
                                FROM transactions t
                                JOIN expense_categories ec ON ec.id = t.expense_category_id
                                WHERE ec.envelop_id = p.envelop_id
                                  AND t.type = 'expense'
                                  AND t.source_account_id = ${input.accountId}
                                  AND t.transaction_datetime >= p.p_start
                                  AND t.transaction_datetime < p.p_end
                                UNION ALL
                                SELECT t.fee_amount AS amount
                                FROM transactions t
                                JOIN expense_categories ec ON ec.id = t.fee_expense_category_id
                                WHERE ec.envelop_id = p.envelop_id
                                  AND t.type = 'transfer'
                                  AND t.fee_amount IS NOT NULL
                                  AND t.source_account_id = ${input.accountId}
                                  AND t.transaction_datetime >= p.p_start
                                  AND t.transaction_datetime < p.p_end
                            ) entry
                        ), 0)::text AS consumed,
                        CASE
                            WHEN p.cadence <> 'none' AND p.carry_over THEN GREATEST(0, (
                                COALESCE((
                                    SELECT SUM(a.amount)
                                    FROM envelop_allocations a
                                    WHERE a.envelop_id = p.envelop_id
                                      AND a.account_id = ${input.accountId}
                                      AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= p.prev_start
                                      AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < p.prev_end
                                ), 0)
                                -
                                COALESCE((
                                    SELECT SUM(entry.amount) FROM (
                                        SELECT t.amount
                                        FROM transactions t
                                        JOIN expense_categories ec ON ec.id = t.expense_category_id
                                        WHERE ec.envelop_id = p.envelop_id
                                          AND t.type = 'expense'
                                          AND t.source_account_id = ${input.accountId}
                                          AND t.transaction_datetime >= p.prev_start
                                          AND t.transaction_datetime < p.prev_end
                                        UNION ALL
                                        SELECT t.fee_amount AS amount
                                        FROM transactions t
                                        JOIN expense_categories ec ON ec.id = t.fee_expense_category_id
                                        WHERE ec.envelop_id = p.envelop_id
                                          AND t.type = 'transfer'
                                          AND t.fee_amount IS NOT NULL
                                          AND t.source_account_id = ${input.accountId}
                                          AND t.transaction_datetime >= p.prev_start
                                          AND t.transaction_datetime < p.prev_end
                                    ) entry
                                ), 0)
                            ))
                            ELSE 0
                        END::text AS carry_in
                    FROM period p
                    JOIN spaces s ON s.id = p.space_id
                    ORDER BY s.name ASC, p.name ASC
                `.execute(ctx.services.qb);

                const envelopes = envelopesRows.rows
                    .map((r) => {
                        const allocated = Number(r.allocated);
                        const consumed = Number(r.consumed);
                        const carryIn = Number(r.carry_in);
                        const remaining = carryIn + allocated - consumed;
                        return {
                            envelopId: r.envelop_id,
                            spaceId: r.space_id,
                            spaceName: r.space_name,
                            name: r.name,
                            color: r.color,
                            icon: r.icon,
                            cadence: r.cadence as "none" | "monthly",
                            allocated,
                            consumed,
                            carryIn,
                            remaining,
                            isDrift: remaining < 0,
                        };
                    })
                    .filter(
                        (e) => e.allocated !== 0 || e.consumed !== 0 || e.carryIn !== 0
                    );

                const plansRows = await sql<{
                    plan_id: string;
                    space_id: string;
                    space_name: string;
                    name: string;
                    color: string;
                    icon: string;
                    allocated: string;
                }>`
                    SELECT
                        p.id::text AS plan_id,
                        p.space_id::text AS space_id,
                        s.name AS space_name,
                        p.name, p.color, p.icon,
                        COALESCE((
                            SELECT SUM(pa.amount)
                            FROM plan_allocations pa
                            WHERE pa.plan_id = p.id
                              AND pa.account_id = ${input.accountId}
                        ), 0)::text AS allocated
                    FROM plans p
                    JOIN spaces s ON s.id = p.space_id
                    ORDER BY s.name ASC, p.name ASC
                `.execute(ctx.services.qb);

                const plans = plansRows.rows
                    .map((r) => ({
                        planId: r.plan_id,
                        spaceId: r.space_id,
                        spaceName: r.space_name,
                        name: r.name,
                        color: r.color,
                        icon: r.icon,
                        allocated: Number(r.allocated),
                    }))
                    .filter((p) => p.allocated !== 0);

                const bal = await ctx.services.qb
                    .selectFrom("account_balances")
                    .select(["balance"])
                    .where("account_id", "=", input.accountId)
                    .executeTakeFirst();
                const balance = Number(bal?.balance ?? 0);

                const envelopeHeld = envelopes.reduce(
                    (acc, e) => acc + Math.max(0, e.remaining),
                    0
                );
                const planHeld = plans.reduce((acc, p) => acc + p.allocated, 0);
                const allocated = envelopeHeld + planHeld;
                const unallocated = balance - allocated;

                return {
                    balance,
                    allocated,
                    unallocated,
                    envelopes,
                    plans,
                };
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute personal account allocation",
            });
        }
        return result;
    });
