import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Per-account allocation view for the Account detail page. Returns:
 *   - `envelopes`: per-envelope partition allocated/consumed/remaining at this account
 *   - `plans`: per-plan allocated at this account
 *   - `balance`, `allocated`, `unallocated` for the account itself
 *
 * Envelope numbers use the envelope's own cadence: cadence='none' pulls
 * lifetime, cadence='monthly' pulls current-month. That matches what the
 * user sees on the Envelopes page so the two views reconcile.
 *
 * Consumed is transactions where `source_account_id = accountId` and
 * `expense_category_id` rolls up to the envelope — regardless of whether
 * the envelope has any allocation tagged to this account. That surfaces
 * drift (consumed without allocation).
 */
export const accountAllocation = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            accountId: z.string().uuid(),
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

                // Verify the account is in this space
                const sa = await trx
                    .selectFrom("space_accounts")
                    .select("account_id")
                    .where("account_id", "=", input.accountId)
                    .where("space_id", "=", input.spaceId)
                    .executeTakeFirst();
                if (!sa) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Account not in this space",
                    });
                }

                // Envelope partitions at this account (current period per cadence)
                const envelopesRows = await sql<{
                    envelop_id: string;
                    name: string;
                    color: string;
                    icon: string;
                    cadence: string;
                    allocated: string;
                    consumed: string;
                }>`
                    WITH period AS (
                        SELECT
                            e.id AS envelop_id,
                            e.name, e.color, e.icon, e.cadence,
                            CASE e.cadence
                                WHEN 'none' THEN DATE '1970-01-01'
                                WHEN 'monthly' THEN DATE_TRUNC('month', NOW())::date
                            END AS p_start,
                            CASE e.cadence
                                WHEN 'none' THEN DATE '9999-12-31'
                                WHEN 'monthly' THEN (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::date
                            END AS p_end
                        FROM envelops e
                        WHERE e.space_id = ${input.spaceId}
                    )
                    SELECT
                        p.envelop_id::text AS envelop_id,
                        p.name, p.color, p.icon, p.cadence,
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
                            SELECT SUM(t.amount)
                            FROM transactions t
                            JOIN expense_categories ec ON ec.id = t.expense_category_id
                            WHERE ec.envelop_id = p.envelop_id
                              AND t.type = 'expense'
                              AND t.source_account_id = ${input.accountId}
                              AND t.transaction_datetime >= p.p_start
                              AND t.transaction_datetime < p.p_end
                        ), 0)::text AS consumed
                    FROM period p
                    ORDER BY p.name ASC
                `.execute(trx);

                const envelopes = envelopesRows.rows
                    .map((r) => {
                        const allocated = Number(r.allocated);
                        const consumed = Number(r.consumed);
                        return {
                            envelopId: r.envelop_id,
                            name: r.name,
                            color: r.color,
                            icon: r.icon,
                            cadence: r.cadence as "none" | "monthly",
                            allocated,
                            consumed,
                            remaining: allocated - consumed,
                            isDrift: allocated - consumed < 0,
                        };
                    })
                    // Hide envelopes with no activity at this account
                    .filter((e) => e.allocated !== 0 || e.consumed !== 0);

                const plansRows = await sql<{
                    plan_id: string;
                    name: string;
                    color: string;
                    icon: string;
                    allocated: string;
                }>`
                    SELECT
                        p.id::text AS plan_id,
                        p.name, p.color, p.icon,
                        COALESCE((
                            SELECT SUM(pa.amount)
                            FROM plan_allocations pa
                            WHERE pa.plan_id = p.id
                              AND pa.account_id = ${input.accountId}
                        ), 0)::text AS allocated
                    FROM plans p
                    WHERE p.space_id = ${input.spaceId}
                    ORDER BY p.name ASC
                `.execute(trx);

                const plans = plansRows.rows
                    .map((r) => ({
                        planId: r.plan_id,
                        name: r.name,
                        color: r.color,
                        icon: r.icon,
                        allocated: Number(r.allocated),
                    }))
                    .filter((p) => p.allocated !== 0);

                // Account balance + account-level unallocated
                const bal = await trx
                    .selectFrom("account_balances")
                    .select(["balance"])
                    .where("account_id", "=", input.accountId)
                    .executeTakeFirst();
                const balance = Number(bal?.balance ?? 0);

                // Allocated AT this account = sum of envelope partition
                // current-period remaining (clamped) + plan partition
                // allocated. Matches the "held" logic in resolveSpaceUnallocated.
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
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute account allocation",
            });
        }
        return result;
    });
