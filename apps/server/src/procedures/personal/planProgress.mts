import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

/**
 * Personal (cross-space) plan progress. Lists every plan in spaces the
 * caller is a member of, with `allocated` restricted to plan_allocations
 * on owned accounts. Same per-account `breakdown` shape as
 * analytics.planProgress so the existing view can render unchanged.
 */
export const personalPlanProgress = authorizedProcedure.query(async ({ ctx }) => {
    const [error, result] = await safeAwait(
        (async () => {
            const owned = await resolveOwnedAccountIds(
                ctx.services.qb,
                ctx.auth.user.id
            );
            const memberSpaces = await resolveMemberSpaceIds(
                ctx.services.qb,
                ctx.auth.user.id
            );
            if (memberSpaces.length === 0) return [];

            const ownedParam =
                owned.length === 0 ? ["00000000-0000-0000-0000-000000000000"] : owned;

            const totals = await sql<{
                plan_id: string;
                space_id: string;
                space_name: string;
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
                    p.space_id::text AS space_id,
                    s.name AS space_name,
                    p.name,
                    p.color,
                    p.icon,
                    p.description,
                    p.target_amount::text AS target_amount,
                    p.target_date,
                    COALESCE((
                        SELECT SUM(pa.amount)
                        FROM plan_allocations pa
                        WHERE pa.plan_id = p.id
                          AND pa.account_id = ANY(${ownedParam})
                    ), 0)::text AS allocated,
                    (SELECT MIN(pa.created_at) FROM plan_allocations pa WHERE pa.plan_id = p.id AND pa.account_id = ANY(${ownedParam})) AS first_allocated_at,
                    (SELECT MAX(pa.created_at) FROM plan_allocations pa WHERE pa.plan_id = p.id AND pa.account_id = ANY(${ownedParam})) AS last_allocated_at
                FROM plans p
                JOIN spaces s ON s.id = p.space_id
                WHERE p.space_id = ANY(${memberSpaces})
                ORDER BY s.name ASC, p.created_at ASC
            `.execute(ctx.services.qb);

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
                WHERE p.space_id = ANY(${memberSpaces})
                  AND pa.account_id = ANY(${ownedParam})
                GROUP BY pa.plan_id, pa.account_id
            `.execute(ctx.services.qb);

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
                    spaceId: r.space_id,
                    spaceName: r.space_name,
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
                    firstAllocatedAt: r.first_allocated_at
                        ? new Date(r.first_allocated_at)
                        : null,
                    lastAllocatedAt: r.last_allocated_at
                        ? new Date(r.last_allocated_at)
                        : null,
                    breakdown: breakdownByPlan.get(r.plan_id) ?? [],
                };
            });
        })()
    );
    if (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message || "Failed to compute personal plan progress",
        });
    }
    return result;
});
