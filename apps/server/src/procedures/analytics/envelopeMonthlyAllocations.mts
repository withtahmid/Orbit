import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Calendar-year monthly allocation history for ONE monthly-cadence
 * envelope — pairs with `trends.yearOverYear`'s per-month spend so the
 * envelope detail page's "Monthly spend" chart can show allocated vs
 * spent per month. Rolling/goal envelopes have no monthly allocation
 * concept (a single lifetime pool row with `period_start IS NULL`), so
 * this only has meaningful data for `cadence = 'monthly'` envelopes.
 */
export const envelopeMonthlyAllocations = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            envelopeId: z.string().uuid(),
            year: z.number().int().min(1970).max(9999).optional(),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: [
                        "owner",
                        "editor",
                        "viewer",
                    ] as unknown as SpaceMembers["role"][],
                });

                const rows = await sql<{
                    year: number;
                    month_idx: number;
                    amount: string;
                }>`
                    SELECT
                        EXTRACT(YEAR FROM a.period_start)::int AS year,
                        (EXTRACT(MONTH FROM a.period_start)::int - 1) AS month_idx,
                        a.amount::text AS amount
                    FROM envelop_allocations a
                    JOIN envelops e ON e.id = a.envelop_id
                    WHERE a.envelop_id = ${input.envelopeId}
                      AND e.space_id = ${input.spaceId}
                      AND a.period_start IS NOT NULL
                `.execute(trx);

                const yearRow = await sql<{ yr: number }>`
                    SELECT COALESCE(
                        ${input.year ?? null}::int,
                        EXTRACT(YEAR FROM now())::int
                    ) AS yr
                `.execute(trx);
                const year = yearRow.rows[0]?.yr ?? new Date().getFullYear();

                const allocated = new Array(12).fill(0);
                for (const r of rows.rows) {
                    if (r.year === year) allocated[r.month_idx] = Number(r.amount);
                }

                return { year, allocated };
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message ||
                    "Failed to compute envelope monthly allocations",
            });
        }
        return result;
    });
