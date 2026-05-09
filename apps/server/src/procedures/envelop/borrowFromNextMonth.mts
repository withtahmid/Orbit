import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Borrow money from next month into the current month for a monthly
 * envelope. Creates two paired rows in `envelop_allocations`, joined by a
 * shared `borrowed_link_id`:
 *
 *   - `+amount` against the current period — funds become available now.
 *   - `-amount` against the next period — next month's planning pool
 *     starts that much smaller, so the user can't forget they borrowed.
 *
 * Only valid for monthly envelopes (cadence='monthly'). For rolling
 * envelopes there's no "next month" — they accumulate.
 */
export const borrowFromNextMonth = authorizedProcedure
    .input(
        z.object({
            envelopId: z.string().uuid(),
            amount: z.number().positive(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const envelop = await trx
                    .selectFrom("envelops")
                    .select(["id", "space_id", "cadence", "archived", "name"])
                    .where("envelops.id", "=", input.envelopId)
                    .executeTakeFirst();

                if (!envelop) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Envelop not found",
                    });
                }

                if (envelop.archived) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: `Envelope "${envelop.name}" is archived. Unarchive it first to borrow.`,
                    });
                }

                if (envelop.cadence !== "monthly") {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message:
                            "Borrowing only works for monthly envelopes — rolling envelopes accumulate.",
                    });
                }

                await resolveSpaceMembership({
                    trx,
                    spaceId: envelop.space_id,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                });

                // Both rows live on UTC month boundaries — matches how
                // createAllocation stores period_start.
                const now = new Date();
                const currentPeriodStart = new Date(
                    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
                );
                const nextPeriodStart = new Date(
                    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
                );

                const linkId = randomUUID();

                const currentRow = await trx
                    .insertInto("envelop_allocations")
                    .values({
                        envelop_id: input.envelopId,
                        amount: input.amount,
                        created_by: ctx.auth.user.id,
                        account_id: null,
                        period_start: currentPeriodStart,
                        borrowed_link_id: linkId,
                    })
                    .returning(["id", "envelop_id", "amount", "period_start"])
                    .executeTakeFirstOrThrow();

                const nextRow = await trx
                    .insertInto("envelop_allocations")
                    .values({
                        envelop_id: input.envelopId,
                        amount: -input.amount,
                        created_by: ctx.auth.user.id,
                        account_id: null,
                        period_start: nextPeriodStart,
                        borrowed_link_id: linkId,
                    })
                    .returning(["id", "envelop_id", "amount", "period_start"])
                    .executeTakeFirstOrThrow();

                return { linkId, currentRow, nextRow };
            })
        );

        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to borrow from next month",
            });
        }

        return result;
    });
