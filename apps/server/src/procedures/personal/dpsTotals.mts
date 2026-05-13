import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import {
    resolveMemberSpaceIds,
    resolveOwnedAccountIds,
} from "./shared.mjs";
import { buildDpsSummary } from "../dps/utils/buildDpsSummary.mjs";

/**
 * Cross-space DPS aggregates for the personal overview. Returns active
 * scheme count, total monthly commitment, current principal, projected
 * interest-so-far, projected net maturity across every personally
 * owned DPS.
 */
export const personalDpsTotals = authorizedProcedure.query(async ({ ctx }) => {
    const [error, result] = await safeAwait(
        ctx.services.qb.transaction().execute(async (trx) => {
            const [ownedAccountIds, memberSpaceIds] = await Promise.all([
                resolveOwnedAccountIds(trx, ctx.auth.user.id),
                resolveMemberSpaceIds(trx, ctx.auth.user.id),
            ]);
            const empty = {
                activeSchemeCount: 0,
                totalMonthlyCommitment: 0,
                totalPrincipal: 0,
                totalInterestSoFar: 0,
                totalProjectedMaturityNet: 0,
            };
            if (ownedAccountIds.length === 0 || memberSpaceIds.length === 0) {
                return empty;
            }

            const schemes = await trx
                .selectFrom("dps_schemes")
                .where("account_id", "in", ownedAccountIds)
                .where("space_id", "in", memberSpaceIds)
                .where("status", "=", "active")
                .selectAll()
                .execute();
            if (schemes.length === 0) return empty;

            const now = new Date();
            const summaries = await Promise.all(
                schemes.map((s) => buildDpsSummary({ trx, scheme: s, now }))
            );

            return summaries.reduce(
                (acc, s) => ({
                    activeSchemeCount: acc.activeSchemeCount + 1,
                    totalMonthlyCommitment:
                        acc.totalMonthlyCommitment + s.monthlyCommitment,
                    totalPrincipal: acc.totalPrincipal + s.currentPrincipal,
                    totalInterestSoFar:
                        acc.totalInterestSoFar + s.projectedInterestSoFar,
                    totalProjectedMaturityNet:
                        acc.totalProjectedMaturityNet +
                        s.projectedMaturityNet,
                }),
                empty
            );
        })
    );
    if (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message || "Failed to total DPS schemes",
        });
    }
    return result;
});
