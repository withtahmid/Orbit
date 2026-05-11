import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { sql } from "kysely";

const HEX = /^#[0-9a-fA-F]{6}$/;

export const updateEnvelop = authorizedProcedure
    .input(
        z
            .object({
                envelopId: z.string().uuid(),
                name: z.string().min(1).max(255).optional(),
                color: z.string().regex(HEX).optional(),
                icon: z.string().min(1).max(48).optional(),
                description: z.string().max(2000).nullable().optional(),
                cadence: z.enum(["none", "monthly"]).optional(),
                carryOver: z.boolean().optional(),
                carryPolicy: z
                    .enum(["reset", "positive_only", "both"])
                    .optional(),
            })
            .refine(
                (d) =>
                    d.name !== undefined ||
                    d.color !== undefined ||
                    d.icon !== undefined ||
                    d.description !== undefined ||
                    d.cadence !== undefined ||
                    d.carryOver !== undefined ||
                    d.carryPolicy !== undefined,
                { message: "At least one field must be provided" }
            )
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

                // carryPolicy is the source of truth in the new model;
                // we keep carry_over in sync so legacy callers / queries
                // that still read the boolean don't break.
                const carryUpdates: {
                    carry_policy?: "reset" | "positive_only" | "both";
                    carry_over?: boolean;
                } = {};
                if (input.carryPolicy !== undefined) {
                    carryUpdates.carry_policy = input.carryPolicy;
                    carryUpdates.carry_over = input.carryPolicy !== "reset";
                } else if (input.carryOver !== undefined) {
                    carryUpdates.carry_over = input.carryOver;
                    carryUpdates.carry_policy = input.carryOver
                        ? "positive_only"
                        : "reset";
                }

                return trx
                    .updateTable("envelops")
                    .set({
                        name: input.name,
                        color: input.color,
                        icon: input.icon,
                        description: input.description,
                        cadence: input.cadence,
                        ...carryUpdates,
                        updated_at: sql`now()`,
                    })
                    .where("envelops.id", "=", input.envelopId)
                    .returning([
                        "id",
                        "space_id",
                        "name",
                        "color",
                        "icon",
                        "description",
                        "cadence",
                        "carry_over",
                        "carry_policy",
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
                message: error.message || "Failed to update envelop",
            });
        }

        return result;
    });
