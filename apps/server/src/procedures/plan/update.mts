import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const updatePlan = authorizedProcedure
    .input(
        z.object({
            planId: z.string().uuid(),
            name: z.string().min(1).max(255),
        })
    )
    .output(
        z.object({
            id: z.string().uuid(),
            space_id: z.string().uuid(),
            name: z.string(),
            created_at: z.date(),
            updated_at: z.date().nullable(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
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

                return trx
                    .updateTable("plans")
                    .set({
                        name: input.name,
                        updated_at: new Date(),
                    })
                    .where("plans.id", "=", input.planId)
                    .returning(["id", "space_id", "name", "created_at", "updated_at"])
                    .executeTakeFirstOrThrow();
            })
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to update plan",
            });
        }

        return result;
    });
