import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { resolveSpaceUnallocated } from "../allocation/utils/resolveSpaceUnallocated.mjs";

export const createEnvelopAllocation = authorizedProcedure
    .input(
        z.object({
            envelopId: z.string().uuid(),
            amount: z.number().refine((v) => v !== 0, {
                message: "Amount must not be zero",
            }),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const envelop = await trx
                    .selectFrom("envelops")
                    .innerJoin("envelop_balances", "envelop_balances.envelop_id", "envelops.id")
                    .select(["envelops.id", "envelops.space_id", "envelop_balances.remaining"])
                    .where("envelops.id", "=", input.envelopId)
                    .executeTakeFirst();

                // envelope_balances row might not exist yet for freshly-created envelopes
                const envelopBasic = envelop
                    ? envelop
                    : await trx
                          .selectFrom("envelops")
                          .select(["id", "space_id"])
                          .where("envelops.id", "=", input.envelopId)
                          .executeTakeFirst();

                if (!envelopBasic) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Envelop not found",
                    });
                }

                await resolveSpaceMembership({
                    trx,
                    spaceId: envelopBasic.space_id,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                });

                if (input.amount > 0) {
                    // Allocating more money into the envelope — must come from unallocated cash.
                    const free = await resolveSpaceUnallocated({
                        trx,
                        spaceId: envelopBasic.space_id,
                    });
                    if (free < input.amount) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: `Only ${free.toFixed(2)} is unallocated. Increase income or pull from another envelope/plan first.`,
                        });
                    }
                } else {
                    // Pulling money out — can't pull more than what currently remains
                    // (we protect against over-deallocation creating a negative remaining).
                    const currentRemaining = Number(
                        (envelop && "remaining" in envelop ? envelop.remaining : 0) ?? 0
                    );
                    if (currentRemaining + input.amount < 0) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: `Envelope only has ${currentRemaining.toFixed(2)} available to deallocate.`,
                        });
                    }
                }

                return trx
                    .insertInto("envelop_allocations")
                    .values({
                        envelop_id: input.envelopId,
                        amount: input.amount,
                        created_by: ctx.auth.user.id,
                    })
                    .returning(["id", "envelop_id", "amount", "created_at", "created_by"])
                    .executeTakeFirstOrThrow();
            })
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to create envelop allocation",
            });
        }

        return result;
    });
