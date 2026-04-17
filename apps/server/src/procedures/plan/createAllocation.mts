import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { resolveSpaceUnallocated } from "../allocation/utils/resolveSpaceUnallocated.mjs";

export const createPlanAllocation = authorizedProcedure
    .input(
        z.object({
            planId: z.string().uuid(),
            amount: z.number().refine((v) => v !== 0, {
                message: "Amount must not be zero",
            }),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const plan = await trx
                    .selectFrom("plans")
                    .leftJoin("plan_balances", "plan_balances.plan_id", "plans.id")
                    .select(["plans.id", "plans.space_id", "plan_balances.allocated"])
                    .where("plans.id", "=", input.planId)
                    .executeTakeFirst();

                if (!plan) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Plan not found",
                    });
                }

                await resolveSpaceMembership({
                    trx,
                    spaceId: plan.space_id,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                });

                if (input.amount > 0) {
                    const free = await resolveSpaceUnallocated({
                        trx,
                        spaceId: plan.space_id,
                    });
                    if (free < input.amount) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: `Only ${free.toFixed(2)} is unallocated. Increase income or pull from another envelope/plan first.`,
                        });
                    }
                } else {
                    const currentAllocated = Number(plan.allocated ?? 0);
                    if (currentAllocated + input.amount < 0) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: `Plan only has ${currentAllocated.toFixed(2)} available to deallocate.`,
                        });
                    }
                }

                return trx
                    .insertInto("plan_allocations")
                    .values({
                        plan_id: input.planId,
                        amount: input.amount,
                        created_by: ctx.auth.user.id,
                    })
                    .returning(["id", "plan_id", "amount", "created_at", "created_by"])
                    .executeTakeFirstOrThrow();
            })
        );

        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to create plan allocation",
            });
        }
        return result;
    });
