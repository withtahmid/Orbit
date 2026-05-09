import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Toggle an envelope's archived flag. Archived envelopes:
 *   - vanish from default UI surfaces (envelopes list, planning, pickers)
 *   - reject new transactions in their categories (server-guarded)
 *   - reject new categories being created under them
 *
 * Existing data is intact: historical transactions still link via their
 * categories, allocation rows stay put, past-month analytics render
 * normally. Reversible via `archived: false`.
 *
 * Owner only — same risk class as delete.
 */
export const archiveEnvelop = authorizedProcedure
    .input(
        z.object({
            envelopId: z.string().uuid(),
            archived: z.boolean(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const envelop = await trx
                    .selectFrom("envelops")
                    .select(["id", "space_id"])
                    .where("envelops.id", "=", input.envelopId)
                    .executeTakeFirst();

                if (!envelop) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Envelop not found",
                    });
                }

                await resolveSpaceMembership({
                    trx,
                    spaceId: envelop.space_id,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as SpaceMembers["role"][],
                });

                return trx
                    .updateTable("envelops")
                    .set({ archived: input.archived })
                    .where("envelops.id", "=", input.envelopId)
                    .returning(["id", "archived"])
                    .executeTakeFirstOrThrow();
            })
        );

        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to archive envelope",
            });
        }

        return result;
    });
