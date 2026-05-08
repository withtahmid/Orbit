import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

export const personalCumulativeSpend = authorizedProcedure
    .input(
        z.object({
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            includePrevious: z.boolean().default(true),
            project: z.boolean().default(true),
        })
    )
    .query(async ({ ctx, input }) => {
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
                if (owned.length === 0 || memberSpaces.length === 0) {
                    return { current: [], previous: [], projection: null };
                }

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
                    WITH days AS (
                        SELECT generate_series(
                            ${prevStart}::timestamptz,
                            ${input.periodEnd}::timestamptz - INTERVAL '1 day',
                            INTERVAL '1 day'
                        )::date AS d
                    ),
                    spend AS (
                        /* Spending = real consumption only. Transfers
                           between the user's owned accounts (or out to
                           accounts they don't own) are excluded — moving
                           money isn't spending. Transfer fees DO count
                           because the fee is money genuinely lost to a
                           provider. See engineering spec §"Spending vs
                           cash flow". */
                        SELECT
                            date_trunc('day', t.transaction_datetime)::date AS d,
                            SUM(
                                CASE
                                    WHEN t.type = 'expense'
                                        AND t.source_account_id = ANY(${owned}) THEN t.amount
                                    ELSE 0
                                END
                                + CASE
                                    WHEN t.type = 'transfer'
                                        AND t.source_account_id = ANY(${owned})
                                        AND t.fee_amount IS NOT NULL THEN t.fee_amount
                                    ELSE 0
                                END
                            ) AS expense
                        FROM transactions t
                        WHERE t.space_id = ANY(${memberSpaces})
                          AND t.transaction_datetime >= ${prevStart}
                          AND t.transaction_datetime < ${input.periodEnd}
                          AND t.source_account_id = ANY(${owned})
                        GROUP BY 1
                    )
                    SELECT
                        d::timestamptz AS bucket,
                        COALESCE(s.expense, 0)::text AS expense,
                        (d >= ${input.periodStart}::date) AS is_current
                    FROM days
                    LEFT JOIN spend s ON s.d = days.d
                    ORDER BY d ASC
                `.execute(ctx.services.qb);

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
                        if (input.includePrevious)
                            previous.push({ day, cumulative: prvRun });
                    }
                }

                let projection: {
                    endOfPeriodTotal: number;
                    method: "linear-runrate";
                } | null = null;
                if (input.project && current.length > 0) {
                    const now = new Date();
                    const idx = current.findIndex(
                        (p) =>
                            p.day.getTime() >
                            Math.min(
                                now.getTime(),
                                input.periodEnd.getTime()
                            )
                    );
                    const elapsedDays = Math.max(
                        1,
                        idx === -1 ? current.length : idx
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
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message ||
                    "Failed to compute personal cumulative spend",
            });
        }
        return result;
    });
