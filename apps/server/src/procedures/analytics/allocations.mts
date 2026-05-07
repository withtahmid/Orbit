import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Space-wide allocation snapshot powering the Allocation map and Allocation
 * matrix views. Returns three parallel arrays plus a drift summary:
 *
 *   - accounts[]:   every account shared into the space, with its current
 *                   balance + asset/liability/locked classification.
 *   - envelopes[]:  every envelope in the space with allocated/consumed
 *                   totals (cadence-agnostic — all-time, see note below).
 *   - matrix[]:     sparse (envelopId, accountId|null, amount) cells. A
 *                   null accountId = unassigned allocation (the
 *                   "Unassigned" column in the matrix view).
 *   - drift:        allocatedSum vs assetBalanceSum so the Totals tab
 *                   can show the over-allocated delta.
 *
 * Period semantics: allocations and consumed are summed over all time
 * here, matching what the AllocationsView/MatrixView fixtures show — the
 * matrix is a "current configuration" snapshot, not a per-period
 * utilization report (that's what envelopeUtilization is for).
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
                        COALESCE((
                            SELECT SUM(a.amount)
                            FROM envelop_allocations a
                            WHERE a.envelop_id = e.id
                        ), 0)::text AS allocated,
                        COALESCE((
                            SELECT SUM(s.amount) FROM (
                                SELECT t.amount
                                FROM transactions t
                                JOIN expense_categories ec ON ec.id = t.expense_category_id
                                WHERE ec.envelop_id = e.id
                                  AND t.type = 'expense'
                                UNION ALL
                                SELECT t.fee_amount AS amount
                                FROM transactions t
                                JOIN expense_categories ec ON ec.id = t.fee_expense_category_id
                                WHERE ec.envelop_id = e.id
                                  AND t.type = 'transfer'
                                  AND t.fee_amount IS NOT NULL
                            ) s
                        ), 0)::text AS consumed
                    FROM envelops e
                    WHERE e.space_id = ${input.spaceId}
                    ORDER BY e.created_at ASC
                `.execute(trx);

                const matrixRes = await sql<{
                    envelop_id: string;
                    account_id: string | null;
                    amount: string;
                }>`
                    SELECT
                        a.envelop_id::text AS envelop_id,
                        a.account_id::text AS account_id,
                        SUM(a.amount)::text AS amount
                    FROM envelop_allocations a
                    JOIN envelops e ON e.id = a.envelop_id
                    WHERE e.space_id = ${input.spaceId}
                    GROUP BY a.envelop_id, a.account_id
                    HAVING SUM(a.amount) > 0
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
                const matrix = matrixRes.rows.map((r) => ({
                    envelopId: r.envelop_id,
                    accountId: r.account_id,
                    amount: Number(r.amount),
                }));

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
                    matrix,
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
