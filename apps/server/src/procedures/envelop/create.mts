import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { withIdempotency } from "../../utils/withIdempotency.mjs";

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
            targetAmount: z.number().positive().nullable().optional(),
            targetDate: z.coerce.date().nullable().optional(),
            idempotencyKey: z.string().uuid().optional(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) =>
                withIdempotency({
                    trx,
                    userId: ctx.auth.user.id,
                    operation: "envelop.create",
                    key: input.idempotencyKey,
                    fn: async () => {
                        await resolveSpaceMembership({
                            trx,
                            spaceId: input.spaceId,
                            userId: ctx.auth.user.id,
                            roles: ["owner"] as unknown as SpaceMembers["role"][],
                        });

                        // Monthly envelopes reset every period; rolling/goal
                        // envelopes (cadence='none') are a single lifetime
                        // pool. There is no carry-over knob.
                        //
                        // Targets are only meaningful for rolling
                        // envelopes (cadence='none'). Reject monthly +
                        // target so the UI cannot create a shape we
                        // don't render yet.
                        if (
                            input.cadence !== "none" &&
                            (input.targetAmount != null ||
                                input.targetDate != null)
                        ) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message:
                                    "Targets are only allowed on rolling envelopes (cadence='none')",
                            });
                        }

                        // Migration 047's CHECK passes any half-set pair
                        // when cadence='none'; enforce the lock-step at
                        // the API boundary the same way update.mts does.
                        const hasAmount = input.targetAmount != null;
                        const hasDate = input.targetDate != null;
                        if (hasAmount !== hasDate) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message:
                                    "Target amount and target date must be set together (or both omitted)",
                            });
                        }

                        return trx
                            .insertInto("envelops")
                            .values({
                                space_id: input.spaceId,
                                name: input.name,
                                color: input.color,
                                icon: input.icon,
                                description: input.description ?? null,
                                cadence: input.cadence,
                                target_amount:
                                    input.targetAmount != null
                                        ? String(input.targetAmount)
                                        : null,
                                target_date: input.targetDate ?? null,
                            })
                            .returning([
                                "id",
                                "space_id",
                                "name",
                                "color",
                                "icon",
                                "description",
                                "cadence",
                                "target_amount",
                                "target_date",
                                "created_at",
                                "updated_at",
                            ])
                            .executeTakeFirstOrThrow();
                    },
                })
            )
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
