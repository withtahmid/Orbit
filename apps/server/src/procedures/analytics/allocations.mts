import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Space-wide allocation snapshot powering the Allocation map view. Returns:
 *
 *   - accounts[]:   every account shared into the space, with its current
 *                   balance + asset/liability/locked classification.
 *   - envelopes[]:  every envelope in the space with allocated/consumed
 *                   for its current window (monthly → this calendar month;
 *                   rolling/goal → lifetime pool).
 *   - drift:        allocatedSum vs assetBalanceSum so the Totals tab
 *                   can show the over-allocated delta.
 *
 * Period semantics: monthly envelopes report the current month's single
 * allocation row (they reset each period — summing all-time would pile every
 * past month's budget into one unbounded total); rolling/goal envelopes
 * report their lifetime pool. Matches `envelopeUtilization`.
 */
export const allocations = authorizedProcedure
    .input(z.object({ spaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor", "viewer"] as unknown as SpaceMembers["role"][],
                });

                const accountsRes = await sql<{
                    id: string;
                    name: string;
                    color: string;
                    icon: string;
                    account_type: "asset" | "liability" | "locked";
                    balance: string;
                }>`
                    SELECT
                        a.id::text AS id,
                        a.name,
                        a.color,
                        a.icon,
                        a.account_type::text AS account_type,
                        COALESCE(ab.balance, 0)::text AS balance
                    FROM accounts a
                    JOIN space_accounts sa ON sa.account_id = a.id
                    LEFT JOIN account_balances ab ON ab.account_id = a.id
                    WHERE sa.space_id = ${input.spaceId}
                    ORDER BY a.name ASC
                `.execute(trx);

                const envelopesRes = await sql<{
                    id: string;
                    name: string;
                    color: string;
                    icon: string;
                    cadence: string;
                    allocated: string;
                    consumed: string;
                }>`
                    SELECT
                        e.id::text AS id,
                        e.name,
                        e.color,
                        e.icon,
                        e.cadence,
                        -- Allocated for the envelope's own window: monthly →
                        -- the current month's single row; rolling/goal → the
                        -- lifetime NULL-period pool row. (Summing all-time
                        -- would add every past month's budget into one
                        -- unbounded total.) Matches envelopeUtilization.
                        COALESCE((
                            SELECT SUM(a.amount)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = e.id
                              AND (
                                  (e.cadence = 'none' AND a.period_start IS NULL)
                                  OR (
                                      e.cadence <> 'none'
                                      AND a.period_start = DATE_TRUNC('month', NOW())::date
                                  )
                              )
                        ), 0)::text AS allocated,
                        -- Consumed over the matching window: monthly → current
                        -- calendar month; rolling/goal → lifetime.
                        COALESCE((
                            SELECT SUM(t.amount)
                            FROM transactions t
                            WHERE t.envelop_id = e.id
                              AND t.type = 'expense'
                              AND (
                                  e.cadence = 'none'
                                  OR (
                                      t.transaction_datetime >= DATE_TRUNC('month', NOW())
                                      AND t.transaction_datetime < (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')
                                  )
                              )
                        ), 0)::text AS consumed
                    FROM envelops e
                    WHERE e.space_id = ${input.spaceId}
                    ORDER BY e.created_at ASC
                `.execute(trx);

                const accounts = accountsRes.rows.map((r) => ({
                    id: r.id,
                    name: r.name,
                    color: r.color,
                    icon: r.icon,
                    accountType: r.account_type,
                    balance: Number(r.balance),
                    isLocked: r.account_type === "locked",
                }));
                const envelopes = envelopesRes.rows.map((r) => {
                    const allocated = Number(r.allocated);
                    const consumed = Number(r.consumed);
                    const remaining = allocated - consumed;
                    return {
                        id: r.id,
                        name: r.name,
                        color: r.color,
                        icon: r.icon,
                        cadence: r.cadence,
                        allocated,
                        consumed,
                        remaining,
                        isDrift: remaining < 0,
                    };
                });
                const allocatedSum = envelopes.reduce(
                    (s, e) => s + e.allocated,
                    0
                );
                const assetBalanceSum = accounts
                    .filter((a) => a.accountType === "asset")
                    .reduce((s, a) => s + a.balance, 0);

                return {
                    accounts,
                    envelopes,
                    drift: {
                        allocatedSum,
                        assetBalanceSum,
                        delta: assetBalanceSum - allocatedSum,
                    },
                };
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute allocations",
            });
        }
        return result;
    });
