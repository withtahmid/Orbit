import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { ALL_ROLES } from "../space/utils/resolveSpaceMembership.mjs";
import { buildDpsSummary } from "./utils/buildDpsSummary.mjs";

/**
 * List DPS schemes recorded in (or whose linked locked account is
 * shared into) a space. Any space member can read; `includeClosed`
 * gates the matured/encashed/abandoned rows.
 *
 * Anchored on `space_accounts` (not `dps_schemes.space_id`) so a DPS
 * whose locked account is shared into a joint household space is
 * visible there even though it was created from the owner's personal
 * space.
 */
export const listDpsBySpace = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            includeClosed: z.boolean().default(false),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ALL_ROLES,
                });

                const baseQ = trx
                    .selectFrom("dps_schemes")
                    .innerJoin(
                        "space_accounts",
                        "space_accounts.account_id",
                        "dps_schemes.account_id"
                    )
                    .where("space_accounts.space_id", "=", input.spaceId)
                    .selectAll("dps_schemes")
                    .orderBy("dps_schemes.start_date", "desc");

                const schemes = input.includeClosed
                    ? await baseQ.execute()
                    : await baseQ.where("dps_schemes.status", "=", "active").execute();

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
                message: error.message || "Failed to list DPS schemes",
            });
        }
        return result!;
    });
