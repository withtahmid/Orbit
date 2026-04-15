import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const createEnvelopAllocation = authorizedProcedure
    .input(
        z.object({
            envelopId: z.string().uuid(),
            amount: z.number().positive(),
        })
    )
    .output(
        z.object({
            id: z.string().uuid(),
            envelop_id: z.string().uuid(),
            amount: z.string(),
            created_at: z.date(),
            created_by: z.string().uuid(),
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
