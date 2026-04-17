import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

const HEX = /^#[0-9a-fA-F]{6}$/;

export const createEnvelop = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            name: z.string().min(1).max(255),
            color: z.string().regex(HEX).optional(),
            icon: z.string().min(1).max(48).optional(),
            description: z.string().max(2000).optional(),
            cadence: z.enum(["none", "monthly"]).default("none"),
            carryOver: z.boolean().default(false),
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
                    .insertInto("envelops")
                    .values({
                        space_id: input.spaceId,
                        name: input.name,
                        color: input.color,
                        icon: input.icon,
                        description: input.description ?? null,
                        cadence: input.cadence,
                        carry_over: input.carryOver,
                    })
                    .returning([
                        "id",
                        "space_id",
                        "name",
                        "color",
                        "icon",
                        "description",
                        "cadence",
                        "carry_over",
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
                message: error.message || "Failed to create envelop",
            });
        }

        return result;
    });
