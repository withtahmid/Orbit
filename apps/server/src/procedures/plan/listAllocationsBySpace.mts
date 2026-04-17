import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const listPlanAllocationsBySpace = authorizedProcedure
    .input(z.object({ spaceId: z.string().uuid() }))
    .output(
        z.array(
            z.object({
                id: z.string().uuid(),
                plan_id: z.string().uuid(),
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
                    .selectFrom("plan_allocations")
                    .innerJoin("plans", "plans.id", "plan_allocations.plan_id")
                    .select([
                        "plan_allocations.id",
                        "plan_allocations.plan_id",
                        "plan_allocations.amount",
                        "plan_allocations.created_at",
                        "plan_allocations.created_by",
                    ])
                    .where("plans.space_id", "=", input.spaceId)
                    .orderBy("plan_allocations.created_at", "desc")
                    .execute();
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to list plan allocations",
            });
        }
        return result;
    });
