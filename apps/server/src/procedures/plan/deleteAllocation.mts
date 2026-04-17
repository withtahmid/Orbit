import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const deletePlanAllocation = authorizedProcedure
    .input(
        z.object({
            allocationId: z.string().uuid(),
        })
    )
    .output(z.object({ message: z.string() }))
    .mutation(async ({ ctx, input }) => {
        const [error] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const allocation = await trx
                    .selectFrom("plan_allocations")
                    .innerJoin("plans", "plans.id", "plan_allocations.plan_id")
                    .select(["plan_allocations.id", "plans.space_id"])
                    .where("plan_allocations.id", "=", input.allocationId)
                    .executeTakeFirst();

                if (!allocation) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Plan allocation not found",
                    });
                }

                await resolveSpaceMembership({
                    trx,
                    spaceId: allocation.space_id,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as SpaceMembers["role"][],
                });

                await trx
                    .deleteFrom("plan_allocations")
                    .where("plan_allocations.id", "=", input.allocationId)
                    .execute();
            })
        );

        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to delete plan allocation",
            });
        }
        return { message: "Plan allocation deleted successfully" };
    });
