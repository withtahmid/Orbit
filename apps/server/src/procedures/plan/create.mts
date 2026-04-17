import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

const HEX = /^#[0-9a-fA-F]{6}$/;

export const createPlan = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            name: z.string().min(1).max(255),
            color: z.string().regex(HEX).optional(),
            icon: z.string().min(1).max(48).optional(),
            description: z.string().max(2000).optional(),
            targetAmount: z.number().positive().optional(),
            targetDate: z.coerce.date().optional(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as SpaceMembers["role"][],
                });

                return trx
                    .insertInto("plans")
                    .values({
                        space_id: input.spaceId,
                        name: input.name,
                        color: input.color,
                        icon: input.icon,
                        description: input.description ?? null,
                        target_amount: input.targetAmount ?? null,
                        target_date: input.targetDate ?? null,
                    })
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
                message: error.message || "Failed to create plan",
            });
        }

        return result;
    });
