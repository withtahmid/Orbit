import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Top N spending categories for the window. "Spending" includes both
 * regular expense transactions and transfer fees (stored on transfer
 * rows as `fee_amount` + `fee_expense_category_id`) — the fee is real
 * money leaving the system and users categorize them like any other
 * expense. A single unified CTE lets the category roll-up SQL stay
 * simple.
 */
export const topCategories = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            limit: z.number().int().min(1).max(50).default(5),
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

                const rows = await sql<{
                    id: string;
                    name: string;
                    color: string;
                    icon: string;
                    total: string;
                }>`
                    WITH spending AS (
                        SELECT expense_category_id AS category_id, amount
                        FROM transactions
                        WHERE type = 'expense'
                          AND space_id = ${input.spaceId}
                          AND expense_category_id IS NOT NULL
                          AND transaction_datetime >= ${input.periodStart}
                          AND transaction_datetime < ${input.periodEnd}
                        UNION ALL
                        SELECT fee_expense_category_id AS category_id, fee_amount AS amount
                        FROM transactions
                        WHERE type = 'transfer'
                          AND fee_amount IS NOT NULL
                          AND space_id = ${input.spaceId}
                          AND transaction_datetime >= ${input.periodStart}
                          AND transaction_datetime < ${input.periodEnd}
                    )
                    SELECT
                        ec.id::text AS id,
                        ec.name,
                        ec.color,
                        ec.icon,
                        SUM(s.amount)::text AS total
                    FROM spending s
                    JOIN expense_categories ec ON ec.id = s.category_id
                    GROUP BY ec.id, ec.name, ec.color, ec.icon
                    ORDER BY SUM(s.amount) DESC
                    LIMIT ${input.limit}
                `.execute(trx);

                return rows.rows.map((r) => ({
                    id: r.id,
                    name: r.name,
                    color: r.color,
                    icon: r.icon,
                    total: Number(r.total),
                }));
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute top categories",
            });
        }
        return result;
    });
