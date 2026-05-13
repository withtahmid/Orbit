import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveDpsSchemeAccess } from "./utils/resolveDpsScheme.mjs";
import { ALL_ROLES } from "../space/utils/resolveSpaceMembership.mjs";
import { simulateDpsTimeline } from "./utils/projectDps.mjs";
import { buildDpsSchedule } from "./utils/dpsSchedule.mjs";

/**
 * Month-by-month projection of the scheme. Powers the chart on the
 * detail page. Pure derivation from the contract — safe to cache long.
 */
export const dpsProjection = authorizedProcedure
    .input(z.object({ schemeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const scheme = await resolveDpsSchemeAccess({
                    trx,
                    schemeId: input.schemeId,
                    userId: ctx.auth.user.id,
                    roles: ALL_ROLES,
                });

                const timeline = simulateDpsTimeline({
                    installmentAmount: Number(scheme.installment_amount),
                    termMonths: Number(scheme.term_months),
                    annualRateBps: Number(scheme.annual_rate_bps),
                    compounding:
                        scheme.compounding === "monthly" ? "monthly" : "quarterly",
                    withholdingTaxBps: Number(scheme.withholding_tax_bps),
                });

                const startDate = new Date(scheme.start_date as unknown as string);
                const schedule = buildDpsSchedule({
                    startDate,
                    installmentDay: Number(scheme.installment_day),
                    termMonths: Number(scheme.term_months),
                });

                return timeline.map((row) => ({
                    monthIndex: row.monthIndex,
                    // monthIndex 0 = day of opening; schedule[0] is month 1
                    date:
                        row.monthIndex === 0
                            ? startDate.toISOString()
                            : schedule[row.monthIndex - 1]!.date.toISOString(),
                    principalCumulative: row.principalCumulative,
                    interestCumulative: row.interestCumulative,
                    balanceCumulative: row.balanceCumulative,
                }));
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute projection",
            });
        }
        return result;
    });
