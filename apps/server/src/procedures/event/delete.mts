import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const deleteEvent = authorizedProcedure
    .input(
        z.object({
            eventId: z.string().uuid(),
        })
    )
    .output(
        z.object({
            message: z.string(),
            unlinkedTransactionCount: z.number(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const event = await trx
                    .selectFrom("events")
                    .select(["events.id", "events.space_id"])
                    .where("events.id", "=", input.eventId)
                    .executeTakeFirst();

                if (!event) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Event not found",
                    });
                }

                await resolveSpaceMembership({
                    trx,
                    spaceId: event.space_id,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                });

                /* Count linked transactions before delete so the client
                   toast can say "N transactions unlinked". The FK is
                   ON DELETE SET NULL, so transactions survive — but
                   their event_id becomes null. */
                const countRow = await trx
                    .selectFrom("transactions")
                    .select((eb) => eb.fn.count<string>("id").as("count"))
                    .where("event_id", "=", input.eventId)
                    .executeTakeFirst();
                const unlinkedTransactionCount = Number(countRow?.count ?? 0);

                await trx.deleteFrom("events").where("events.id", "=", input.eventId).execute();

                return { unlinkedTransactionCount };
            })
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to delete event",
            });
        }

        return {
            message: "Event deleted successfully",
            unlinkedTransactionCount: result?.unlinkedTransactionCount ?? 0,
        };
    });
