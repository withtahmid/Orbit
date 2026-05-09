import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { withIdempotency } from "../../utils/withIdempotency.mjs";

/**
 * Atomically delete both rows of a borrow pair, identified by their shared
 * `borrowed_link_id`. Used by the envelope detail page's "Cancel borrow"
 * action when the user wants to unwind a previously-made borrow.
 *
 * Safe even if the user has spent against the borrowed funds in the
 * current period — we just remove the borrow rows; the resulting
 * remaining will reflect whatever's actually been allocated/spent. If
 * removing the +amount row would push the current period below the
 * already-consumed amount, the caller will see a negative remaining
 * (drift), same as any other overspend. We don't block on that here:
 * blocking would prevent the user from cleaning up old links.
 */
export const undoBorrow = authorizedProcedure
    .input(
        z.object({
            envelopId: z.string().uuid(),
            linkId: z.string().uuid(),
            idempotencyKey: z.string().uuid().optional(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) =>
                withIdempotency({
                    trx,
                    userId: ctx.auth.user.id,
                    operation: "envelop.undoBorrow",
                    key: input.idempotencyKey,
                    fn: async () => {
                        const envelop = await trx
                            .selectFrom("envelops")
                            .select(["space_id"])
                            .where("id", "=", input.envelopId)
                            .executeTakeFirst();

                        if (!envelop) {
                            throw new TRPCError({
                                code: "NOT_FOUND",
                                message: "Envelope not found",
                            });
                        }

                        await resolveSpaceMembership({
                            trx,
                            spaceId: envelop.space_id,
                            userId: ctx.auth.user.id,
                            roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                        });

                        // Defensive: only delete rows that match BOTH the
                        // envelope and the link. Stops a malformed call
                        // with the wrong envelopId from deleting a borrow
                        // pair that belongs to a different envelope.
                        const deleted = await trx
                            .deleteFrom("envelop_allocations")
                            .where("envelop_id", "=", input.envelopId)
                            .where("borrowed_link_id", "=", input.linkId)
                            .returning(["id"])
                            .execute();

                        if (deleted.length === 0) {
                            throw new TRPCError({
                                code: "NOT_FOUND",
                                message: "Borrow link not found",
                            });
                        }

                        return { linkId: input.linkId, removed: deleted.length };
                    },
                })
            )
        );

        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to undo borrow",
            });
        }
        return result;
    });
