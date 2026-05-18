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
                targetAmount: z.number().positive().nullable().optional(),
                targetDate: z.coerce.date().nullable().optional(),
            })
            .refine(
                (d) =>
                    d.name !== undefined ||
                    d.color !== undefined ||
                    d.icon !== undefined ||
                    d.description !== undefined ||
                    d.cadence !== undefined ||
                    d.carryOver !== undefined ||
                    d.carryPolicy !== undefined ||
                    d.targetAmount !== undefined ||
                    d.targetDate !== undefined,
                { message: "At least one field must be provided" }
            )
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const envelop = await trx
                    .selectFrom("envelops")
                    .select([
                        "id",
                        "space_id",
                        "cadence",
                        "target_amount",
                        "target_date",
                    ])
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

                // Targets only apply when the envelope is (or is being
                // moved to) cadence='none'. The effective cadence after
                // this update is input.cadence if provided, else the
                // existing envelope.cadence.
                const effectiveCadence = input.cadence ?? envelop.cadence;

                // Reject any non-null target inbound on a non-rolling
                // cadence — the invariant is "targets only on cadence='none'".
                if (
                    effectiveCadence !== "none" &&
                    (input.targetAmount != null || input.targetDate != null)
                ) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message:
                            "Targets are only allowed on rolling envelopes (cadence='none')",
                    });
                }

                const targetUpdates: {
                    target_amount?: string | null;
                    target_date?: Date | null;
                } = {};
                if (effectiveCadence !== "none") {
                    // Any cadence move away from 'none' wipes both target
                    // columns unconditionally. Mirrors the DB-level CHECK
                    // added in migration 047 so we can never persist a
                    // stale target_date next to a monthly envelope.
                    targetUpdates.target_amount = null;
                    targetUpdates.target_date = null;
                } else {
                    // Stage the inbound writes first. `undefined` means
                    // "caller did not touch this column" — preserve stored.
                    if (input.targetAmount !== undefined) {
                        targetUpdates.target_amount =
                            input.targetAmount === null
                                ? null
                                : String(input.targetAmount);
                    }
                    if (input.targetDate !== undefined) {
                        targetUpdates.target_date = input.targetDate;
                    }
                    // Lock-step against the *merged post-update state* so
                    // no input combination can persist (amount-null, date-set)
                    // or (date-null, amount-set). Both columns clear or both
                    // stay set.
                    const mergedAmount =
                        targetUpdates.target_amount !== undefined
                            ? targetUpdates.target_amount
                            : envelop.target_amount;
                    const mergedDate =
                        targetUpdates.target_date !== undefined
                            ? targetUpdates.target_date
                            : envelop.target_date;
                    const exactlyOneNull =
                        (mergedAmount == null) !== (mergedDate == null);
                    if (exactlyOneNull) {
                        targetUpdates.target_amount = null;
                        targetUpdates.target_date = null;
                    }
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
                        ...targetUpdates,
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
                message: error.message || "Failed to update envelop",
            });
        }

        return result;
    });
