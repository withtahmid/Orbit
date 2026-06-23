import { TRPCError } from "@trpc/server";
import { Kysely, sql } from "kysely";
import { z } from "zod";
import type { DB, SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { resolveEnvelopePeriodBalance } from "../envelop/utils/resolveEnvelopePeriodBalance.mjs";
import {
    effectivePeriodStart,
    type Cadence,
} from "../envelop/utils/periodWindow.mjs";
import { withIdempotency } from "../../utils/withIdempotency.mjs";

/**
 * Move allocation between two envelopes in the same space. Re-expressed as
 * two upserts against the one-row-per-(envelope, month) model: the source
 * month row is decremented and the destination month row incremented (or
 * the lifetime NULL-period row for rolling/goal envelopes). The period is
 * always the envelope's current period — historical periods aren't retargetable.
 */

const targetSchema = z.object({
    envelopId: z.string().uuid(),
});

type Target = z.infer<typeof targetSchema>;

export const transferAllocation = authorizedProcedure
    .input(
        z.object({
            amount: z.number().positive(),
            from: targetSchema,
            to: targetSchema,
            idempotencyKey: z.string().uuid().optional(),
        })
    )
    .output(z.object({ message: z.string() }))
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) =>
                withIdempotency({
                    trx,
                    userId: ctx.auth.user.id,
                    operation: "allocation.transfer",
                    key: input.idempotencyKey,
                    fn: async () => {
                        if (input.from.envelopId === input.to.envelopId) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message:
                                    "Source and destination cannot be the same envelope",
                            });
                        }

                        // Lock BOTH envelope rows up front, in a deterministic
                        // (sorted) order so concurrent transfers between the
                        // same pair can't deadlock. This serializes the
                        // source-has-enough guard's read-then-upsert against
                        // any concurrent allocate/deallocate/transfer so the
                        // source can't be over-pulled negative.
                        await trx
                            .selectFrom("envelops")
                            .select("id")
                            .where("id", "in", [
                                input.from.envelopId,
                                input.to.envelopId,
                            ])
                            .orderBy("id")
                            .forUpdate()
                            .execute();

                        const fromInfo = await resolveTargetInfo(trx, input.from);
                        const toInfo = await resolveTargetInfo(trx, input.to);

                        if (fromInfo.spaceId !== toInfo.spaceId) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message:
                                    "Source and destination must be in the same space",
                            });
                        }

                        await resolveSpaceMembership({
                            trx,
                            spaceId: fromInfo.spaceId,
                            userId: ctx.auth.user.id,
                            roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                        });

                        // Block transfers INTO an archived envelope.
                        // Transfers OUT of one are allowed so trapped cash
                        // can be freed without unarchiving. Runs after the
                        // membership check so the error message can't be
                        // used to probe envelope names cross-space.
                        const dest = await trx
                            .selectFrom("envelops")
                            .select(["archived", "name"])
                            .where("id", "=", input.to.envelopId)
                            .executeTakeFirst();
                        if (dest?.archived) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message: `Envelope "${dest.name}" is archived. Pick a different destination.`,
                            });
                        }

                        // Source must have enough to give.
                        if (fromInfo.available < input.amount) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message:
                                    "Source has insufficient available balance",
                                cause: { available: fromInfo.available },
                            });
                        }

                        await upsertAllocationDelta(
                            trx,
                            input.from.envelopId,
                            -input.amount,
                            fromInfo.periodStart,
                            ctx.auth.user.id
                        );
                        await upsertAllocationDelta(
                            trx,
                            input.to.envelopId,
                            input.amount,
                            toInfo.periodStart,
                            ctx.auth.user.id
                        );

                        return { message: "Allocation transferred" };
                    },
                })
            )
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to transfer allocation",
            });
        }
        return result ?? { message: "Allocation transferred" };
    });

/** Accumulating upsert against the single (envelope, period) allocation row. */
async function upsertAllocationDelta(
    trx: Kysely<DB>,
    envelopId: string,
    amount: number,
    periodStart: Date | null,
    userId: string
): Promise<void> {
    await trx
        .insertInto("envelop_allocations")
        .values({
            envelop_id: envelopId,
            amount,
            created_by: userId,
            period_start: periodStart,
        })
        .onConflict((oc) =>
            oc.columns(["envelop_id", "period_start"]).doUpdateSet({
                amount: sql`envelop_allocations.amount + excluded.amount`,
                created_by: (eb) => eb.ref("excluded.created_by"),
            })
        )
        .execute();
}

async function resolveTargetInfo(
    trx: Kysely<DB>,
    target: Target
): Promise<{
    spaceId: string;
    available: number;
    periodStart: Date | null;
}> {
    const envelope = await trx
        .selectFrom("envelops")
        .select(["space_id", "cadence"])
        .where("id", "=", target.envelopId)
        .executeTakeFirst();
    if (!envelope) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Envelope not found" });
    }
    const cadence = envelope.cadence as Cadence;
    const now = new Date();
    const periodStart =
        cadence === "none" ? null : effectivePeriodStart(cadence, null, now);

    const bal = await resolveEnvelopePeriodBalance({
        trx,
        envelopId: target.envelopId,
        at: now,
    });
    return {
        spaceId: envelope.space_id,
        available: bal.remaining,
        periodStart,
    };
}
