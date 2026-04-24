import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

type Tier = "essential" | "important" | "discretionary" | "luxury" | "unclassified";

const TIER_ORDER: Tier[] = [
    "essential",
    "important",
    "discretionary",
    "luxury",
    "unclassified",
];

const TIER_LABEL: Record<Tier, string> = {
    essential: "Essential",
    important: "Important",
    discretionary: "Discretionary",
    luxury: "Luxury",
    unclassified: "Unclassified",
};

const TIER_COLOR: Record<Tier, string> = {
    essential: "#dc2626",
    important: "#f59e0b",
    discretionary: "#3b82f6",
    luxury: "#a855f7",
    unclassified: "#64748b",
};

export const priorityBreakdown = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
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

                // Priority lives on the category. Children with NULL
                // priority inherit from the nearest ancestor that has
                // one; a root with NULL is "unclassified." The
                // `resolved` CTE walks each category up the parent
                // chain using a recursive self-join and picks the
                // first non-NULL priority it finds.
                //
                // Scope matches cashFlow's account-flow rule (§12):
                // only expenses whose source is in the space's
                // scope_accounts count, plus transfer fees attributed
                // to fee_expense_category_id whose source is in scope.
                const query = sql<{ priority: string | null; total: string }>`
                    WITH RECURSIVE scope_accounts AS (
                        SELECT sa.account_id
                        FROM space_accounts sa
                        WHERE sa.space_id = ${input.spaceId}
                    ),
                    ancestry AS (
                        -- depth 0: each category is its own starting point.
                        SELECT id, parent_id, priority, id AS origin
                        FROM expense_categories
                        WHERE space_id = ${input.spaceId}
                        UNION ALL
                        -- Walk up through any NULL-priority ancestors.
                        SELECT parent.id, parent.parent_id, parent.priority, a.origin
                        FROM ancestry a
                        JOIN expense_categories parent ON parent.id = a.parent_id
                        WHERE a.priority IS NULL
                    ),
                    resolved AS (
                        SELECT origin AS id,
                               (ARRAY_AGG(priority)
                                FILTER (WHERE priority IS NOT NULL))[1]
                               AS effective_priority
                        FROM ancestry
                        GROUP BY origin
                    ),
                    entries AS (
                        SELECT t.expense_category_id AS ec_id, t.amount AS amount
                        FROM transactions t
                        WHERE t.type = 'expense'
                          AND t.source_account_id IN (SELECT account_id FROM scope_accounts)
                          AND t.transaction_datetime >= ${input.periodStart}
                          AND t.transaction_datetime < ${input.periodEnd}
                        UNION ALL
                        SELECT t.fee_expense_category_id, t.fee_amount
                        FROM transactions t
                        WHERE t.type = 'transfer'
                          AND t.fee_amount IS NOT NULL
                          AND t.source_account_id IN (SELECT account_id FROM scope_accounts)
                          AND t.transaction_datetime >= ${input.periodStart}
                          AND t.transaction_datetime < ${input.periodEnd}
                    )
                    SELECT r.effective_priority AS priority,
                           COALESCE(SUM(e.amount), 0)::text AS total
                    FROM entries e
                    LEFT JOIN resolved r ON r.id = e.ec_id
                    GROUP BY r.effective_priority
                `;
                const res = await query.execute(trx);

                const totals = new Map<Tier, number>(
                    TIER_ORDER.map((t) => [t, 0])
                );
                for (const row of res.rows) {
                    const key: Tier =
                        row.priority &&
                        TIER_ORDER.includes(row.priority as Tier)
                            ? (row.priority as Tier)
                            : "unclassified";
                    totals.set(key, (totals.get(key) ?? 0) + Number(row.total));
                }

                return TIER_ORDER.map((tier) => ({
                    priority: tier,
                    label: TIER_LABEL[tier],
                    color: TIER_COLOR[tier],
                    total: totals.get(tier) ?? 0,
                }));
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute priority breakdown",
            });
        }
        return result;
    });
