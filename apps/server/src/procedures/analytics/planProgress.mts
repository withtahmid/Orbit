import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Per-plan progress with per-account breakdown. Plans are rolling (no
 * cadence), so allocation amounts are simply the signed sum over all
 * plan_allocations. `account_id IS NULL` rows are the unassigned pool.
 */
export const planProgress = authorizedProcedure
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

                const totals = await sql<{
                    plan_id: string;
                    name: string;
                    color: string;
                    icon: string;
                    description: string | null;
                    target_amount: string | null;
                    target_date: Date | null;
                    allocated: string;
                    first_allocated_at: Date | null;
                    last_allocated_at: Date | null;
                }>`
                    SELECT
                        p.id::text AS plan_id,
                        p.name,
                        p.color,
                        p.icon,
                        p.description,
                        p.target_amount::text AS target_amount,
                        p.target_date,
                        COALESCE((
                            SELECT SUM(pa.amount) FROM plan_allocations pa WHERE pa.plan_id = p.id
                        ), 0)::text AS allocated,
                        (SELECT MIN(pa.created_at) FROM plan_allocations pa WHERE pa.plan_id = p.id) AS first_allocated_at,
                        (SELECT MAX(pa.created_at) FROM plan_allocations pa WHERE pa.plan_id = p.id) AS last_allocated_at
                    FROM plans p
                    WHERE p.space_id = ${input.spaceId}
                    ORDER BY p.created_at ASC
                `.execute(trx);

                const breakdown = await sql<{
                    plan_id: string;
                    account_id: string | null;
                    allocated: string;
                }>`
                    SELECT
                        pa.plan_id::text AS plan_id,
                        pa.account_id::text AS account_id,
                        SUM(pa.amount)::text AS allocated
                    FROM plan_allocations pa
                    JOIN plans p ON p.id = pa.plan_id
                    WHERE p.space_id = ${input.spaceId}
                    GROUP BY pa.plan_id, pa.account_id
                `.execute(trx);

                const breakdownByPlan = new Map<
                    string,
                    Array<{ accountId: string | null; allocated: number }>
                >();
                for (const r of breakdown.rows) {
                    const arr = breakdownByPlan.get(r.plan_id) ?? [];
                    arr.push({
                        accountId: r.account_id,
                        allocated: Number(r.allocated),
                    });
                    breakdownByPlan.set(r.plan_id, arr);
                }

                return totals.rows.map((r) => {
                    const target = r.target_amount ? Number(r.target_amount) : null;
                    const allocated = Number(r.allocated);
                    return {
                        planId: r.plan_id,
                        name: r.name,
                        color: r.color,
                        icon: r.icon,
                        description: r.description,
                        targetAmount: target,
                        targetDate: r.target_date ? new Date(r.target_date) : null,
                        allocated,
                        pctComplete:
                            target && target > 0
                                ? Math.min(100, (allocated / target) * 100)
                                : null,
                        firstAllocatedAt: r.first_allocated_at ? new Date(r.first_allocated_at) : null,
                        lastAllocatedAt: r.last_allocated_at ? new Date(r.last_allocated_at) : null,
                        breakdown: breakdownByPlan.get(r.plan_id) ?? [],
                    };
                });
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute plan progress",
            });
        }
        return result;
    });
