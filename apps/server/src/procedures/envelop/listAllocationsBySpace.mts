import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const listEnvelopAllocationsBySpace = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
        })
    )
    .output(
        z.array(
            z.object({
                id: z.string().uuid(),
                envelop_id: z.string().uuid(),
                amount: z.string(),
                created_at: z.date(),
                created_by: z.string().uuid(),
            })
        )
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor", "viewer"] as unknown as SpaceMembers["role"][],
                });

                return trx
                    .selectFrom("envelop_allocations")
                    .innerJoin("envelops", "envelops.id", "envelop_allocations.envelop_id")
                    .select([
                        "envelop_allocations.id",
                        "envelop_allocations.envelop_id",
                        "envelop_allocations.amount",
                        "envelop_allocations.created_at",
                        "envelop_allocations.created_by",
                    ])
                    .where("envelops.space_id", "=", input.spaceId)
                    .orderBy("envelop_allocations.created_at", "desc")
                    .execute();
            })
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to fetch envelop allocations",
            });
        }

        return result;
    });
