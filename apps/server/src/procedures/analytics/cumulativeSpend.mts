import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Per-day cumulative expense for the requested window, the
 * immediately-preceding window of equal length, and a linear-runrate
 * projection for the remaining days of the current window. Powers the
 * Overview SpendingTrends card.
 *
 * Projection: `(currentCumulative / daysElapsed) * totalDays`. Trivially
 * naive but matches what the design canvas shows; replace with a smarter
 * model later if product wants seasonality.
 */
export const cumulativeSpend = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            includePrevious: z.boolean().default(true),
            project: z.boolean().default(true),
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

                const durationMs =
                    input.periodEnd.getTime() - input.periodStart.getTime();
                const prevStart = new Date(
                    input.periodStart.getTime() - durationMs
                );

                const rows = await sql<{
                    bucket: Date;
                    expense: string;
                    is_current: boolean;
                }>`
                    WITH scope_accounts AS (
                        SELECT account_id
                        FROM space_accounts
                        WHERE space_id = ${input.spaceId}
                    ),
                    days AS (
                        SELECT generate_series(
                            ${prevStart}::timestamptz,
                            ${input.periodEnd}::timestamptz - INTERVAL '1 day',
                            INTERVAL '1 day'
                        )::date AS d
                    ),
                    spend AS (
                        /* Spending = real consumption only. Outbound transfers
                           (source in scope, destination outside) are excluded
                           because moving money to another of the user's
                           accounts isn't spending — see engineering spec
                           §"Spending vs cash flow". Transfer fees DO count
                           because the fee is money genuinely lost to a
                           provider. Cash flow / balance procs use a
                           different formula that includes outbound
                           transfers. */
                        SELECT
                            date_trunc('day', t.transaction_datetime)::date AS d,
                            SUM(
                                CASE
                                    WHEN t.type = 'expense'
                                        AND t.source_account_id IN (SELECT account_id FROM scope_accounts) THEN t.amount
                                    ELSE 0
                                END
                                + CASE
                                    WHEN t.type = 'transfer'
                                        AND t.source_account_id IN (SELECT account_id FROM scope_accounts)
                                        AND t.fee_amount IS NOT NULL THEN t.fee_amount
                                    ELSE 0
                                END
                            ) AS expense
                        FROM transactions t
                        WHERE t.transaction_datetime >= ${prevStart}
                          AND t.transaction_datetime < ${input.periodEnd}
                          AND t.source_account_id IN (SELECT account_id FROM scope_accounts)
                        GROUP BY 1
                    )
                    SELECT
                        d::timestamptz AS bucket,
                        COALESCE(s.expense, 0)::text AS expense,
                        (d >= ${input.periodStart}::date) AS is_current
                    FROM days
                    LEFT JOIN spend s ON s.d = days.d
                    ORDER BY d ASC
                `.execute(trx);

                const current: Array<{ day: Date; cumulative: number }> = [];
                const previous: Array<{ day: Date; cumulative: number }> = [];
                let curRun = 0;
                let prvRun = 0;
                for (const r of rows.rows) {
                    const day = new Date(r.bucket);
                    if (r.is_current) {
                        curRun += Number(r.expense);
                        current.push({ day, cumulative: curRun });
                    } else {
                        prvRun += Number(r.expense);
                        if (input.includePrevious) {
                            previous.push({ day, cumulative: prvRun });
                        }
                    }
                }

                let projection: {
                    endOfPeriodTotal: number;
                    method: "linear-runrate";
                } | null = null;
                if (input.project && current.length > 0) {
                    const now = new Date();
                    const elapsedDays = Math.max(
                        1,
                        Math.min(
                            current.length,
                            current.findIndex(
                                (p) =>
                                    p.day.getTime() >
                                    Math.min(
                                        now.getTime(),
                                        input.periodEnd.getTime()
                                    )
                            ) === -1
                                ? current.length
                                : current.findIndex(
                                      (p) =>
                                          p.day.getTime() >
                                          Math.min(
                                              now.getTime(),
                                              input.periodEnd.getTime()
                                          )
                                  )
                        )
                    );
                    const totalDays = current.length;
                    const runRate =
                        current[elapsedDays - 1]?.cumulative ?? 0;
                    projection = {
                        endOfPeriodTotal:
                            (runRate / elapsedDays) * totalDays,
                        method: "linear-runrate",
                    };
                }

                return {
                    current,
                    previous: input.includePrevious ? previous : [],
                    projection,
                };
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message || "Failed to compute cumulative spend",
            });
        }
        return result;
    });
