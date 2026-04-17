import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

const HEX = /^#[0-9a-fA-F]{6}$/;

export const updatePlan = authorizedProcedure
    .input(
        z
            .object({
                planId: z.string().uuid(),
                name: z.string().min(1).max(255).optional(),
                color: z.string().regex(HEX).optional(),
                icon: z.string().min(1).max(48).optional(),
                description: z.string().max(2000).nullable().optional(),
                targetAmount: z.number().positive().nullable().optional(),
                targetDate: z.coerce.date().nullable().optional(),
            })
            .refine(
                (d) =>
                    d.name !== undefined ||
                    d.color !== undefined ||
                    d.icon !== undefined ||
                    d.description !== undefined ||
                    d.targetAmount !== undefined ||
                    d.targetDate !== undefined,
                { message: "At least one field must be provided" }
            )
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
                        color: input.color,
                        icon: input.icon,
                        description: input.description,
                        target_amount: input.targetAmount,
                        target_date: input.targetDate,
                        updated_at: new Date(),
                    })
                    .where("plans.id", "=", input.planId)
                    .returning([
                        "id",
                        "space_id",
                        "name",
                        "color",
                        "icon",
                        "description",
                        "target_amount",
                        "target_date",
                        "created_at",
                        "updated_at",
                    ])
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
