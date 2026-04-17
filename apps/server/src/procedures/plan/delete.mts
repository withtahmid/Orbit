import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const deletePlan = authorizedProcedure
    .input(
        z.object({
            planId: z.string().uuid(),
        })
    )
    .output(
        z.object({
            message: z.string(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const current = await trx
                    .selectFrom("plans")
                    .select(["id", "space_id"])
                    .where("plans.id", "=", input.planId)
                    .executeTakeFirst();

                if (!current) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Plan not found",
                    });
                }

                await resolveSpaceMembership({
                    trx,
                    spaceId: current.space_id,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as SpaceMembers["role"][],
                });

                await trx.deleteFrom("plans").where("plans.id", "=", input.planId).execute();
            })
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to delete plan",
            });
        }

        return {
            message: "Plan deleted successfully",
        };
    });
