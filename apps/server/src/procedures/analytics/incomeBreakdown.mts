import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Income source breakdown for the period. The schema has no
 * `income_source` column today — group by normalized description so
 * recurring labels (Salary, Freelance, Reimbursement, …) collapse
 * naturally. Rows with empty descriptions roll into "Other" so the
 * total still reconciles with cashFlow's income column.
 *
 * Income population matches cashFlow's account-flow rule (§12): income
 * landing in a scoped account, plus inbound transfers from outside the
 * space. Internal (in-space → in-space) transfers are excluded.
 */
export const incomeBreakdown = authorizedProcedure
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

                const rows = await sql<{
                    source: string;
                    amount: string;
                    count: string;
                }>`
                    WITH scope_accounts AS (
                        SELECT account_id
                        FROM space_accounts
                        WHERE space_id = ${input.spaceId}
                    ),
                    inflow AS (
                        SELECT
                            COALESCE(NULLIF(TRIM(t.description), ''), 'Other') AS source_raw,
                            t.amount
                        FROM transactions t
                        WHERE t.transaction_datetime >= ${input.periodStart}
                          AND t.transaction_datetime < ${input.periodEnd}
                          AND (
                              (t.type = 'income'
                                  AND t.destination_account_id IN (SELECT account_id FROM scope_accounts))
                              OR (t.type = 'transfer'
                                  AND t.destination_account_id IN (SELECT account_id FROM scope_accounts)
                                  AND t.source_account_id NOT IN (SELECT account_id FROM scope_accounts))
                              OR (t.type = 'adjustment'
                                  AND t.destination_account_id IN (SELECT account_id FROM scope_accounts))
                          )
                    )
                    SELECT
                        INITCAP(LOWER(source_raw)) AS source,
                        SUM(amount)::text AS amount,
                        COUNT(*)::text AS count
                    FROM inflow
                    GROUP BY INITCAP(LOWER(source_raw))
                    ORDER BY SUM(amount) DESC
                `.execute(trx);

                return rows.rows.map((r) => ({
                    source: r.source,
                    amount: Number(r.amount),
                    count: Number(r.count),
                }));
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message || "Failed to compute income breakdown",
            });
        }
        return result;
    });
