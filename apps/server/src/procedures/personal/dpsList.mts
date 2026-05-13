import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import {
    resolveMemberSpaceIds,
    resolveOwnedAccountIds,
} from "./shared.mjs";
import { buildDpsSummary } from "../dps/utils/buildDpsSummary.mjs";

/**
 * Personal-space twin of `dps.listBySpace`: every DPS scheme whose
 * linked locked account is personally owned by the caller, across
 * every space they're a member of. Powers `/s/me/dps`.
 */
export const personalDpsList = authorizedProcedure
    .input(z.object({ includeClosed: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const [ownedAccountIds, memberSpaceIds] = await Promise.all([
                    resolveOwnedAccountIds(trx, ctx.auth.user.id),
                    resolveMemberSpaceIds(trx, ctx.auth.user.id),
                ]);
                if (
                    ownedAccountIds.length === 0 ||
                    memberSpaceIds.length === 0
                ) {
                    return [];
                }

                const baseQ = trx
                    .selectFrom("dps_schemes")
                    .where("account_id", "in", ownedAccountIds)
                    .where("space_id", "in", memberSpaceIds)
                    .selectAll()
                    .orderBy("start_date", "desc");

                const schemes = input?.includeClosed
                    ? await baseQ.execute()
                    : await baseQ.where("status", "=", "active").execute();

                const now = new Date();
                return await Promise.all(
                    schemes.map((s) =>
                        buildDpsSummary({ trx, scheme: s, now })
                    )
                );
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to list personal DPS schemes",
            });
        }
        return result;
    });
