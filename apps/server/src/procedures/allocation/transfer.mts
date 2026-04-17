import { TRPCError } from "@trpc/server";
import { Kysely } from "kysely";
import { z } from "zod";
import type { DB, SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

const targetSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("envelop"), envelopId: z.string().uuid() }),
    z.object({ kind: z.literal("plan"), planId: z.string().uuid() }),
]);

type Target = z.infer<typeof targetSchema>;

export const transferAllocation = authorizedProcedure
    .input(
        z.object({
            amount: z.number().positive(),
            from: targetSchema,
            to: targetSchema,
        })
    )
    .output(z.object({ message: z.string() }))
    .mutation(async ({ ctx, input }) => {
        const [error] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const fromInfo = await resolveTargetInfo(trx, input.from);
                const toInfo = await resolveTargetInfo(trx, input.to);

                if (fromInfo.spaceId !== toInfo.spaceId) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Source and destination must be in the same space",
                    });
                }

                if (
                    input.from.kind === input.to.kind &&
                    ((input.from.kind === "envelop" &&
                        input.to.kind === "envelop" &&
                        input.from.envelopId === input.to.envelopId) ||
                        (input.from.kind === "plan" &&
                            input.to.kind === "plan" &&
                            input.from.planId === input.to.planId))
                ) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Source and destination cannot be the same",
                    });
                }

                await resolveSpaceMembership({
                    trx,
                    spaceId: fromInfo.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                });

                // Source must have enough to give
                if (fromInfo.available < input.amount) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: `Source only has ${fromInfo.available.toFixed(2)} available.`,
                    });
                }

                if (input.from.kind === "envelop") {
                    await trx
                        .insertInto("envelop_allocations")
                        .values({
                            envelop_id: input.from.envelopId,
                            amount: -input.amount,
                            created_by: ctx.auth.user.id,
                        })
                        .execute();
                } else {
                    await trx
                        .insertInto("plan_allocations")
                        .values({
                            plan_id: input.from.planId,
                            amount: -input.amount,
                            created_by: ctx.auth.user.id,
                        })
                        .execute();
                }

                if (input.to.kind === "envelop") {
                    await trx
                        .insertInto("envelop_allocations")
                        .values({
                            envelop_id: input.to.envelopId,
                            amount: input.amount,
                            created_by: ctx.auth.user.id,
                        })
                        .execute();
                } else {
                    await trx
                        .insertInto("plan_allocations")
                        .values({
                            plan_id: input.to.planId,
                            amount: input.amount,
                            created_by: ctx.auth.user.id,
                        })
                        .execute();
                }
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to transfer allocation",
            });
        }
        return { message: "Allocation transferred" };
    });

async function resolveTargetInfo(
    trx: Kysely<DB>,
    target: Target
): Promise<{ spaceId: string; available: number }> {
    if (target.kind === "envelop") {
        const row = await trx
            .selectFrom("envelops")
            .leftJoin("envelop_balances", "envelop_balances.envelop_id", "envelops.id")
            .select(["envelops.space_id", "envelop_balances.remaining"])
            .where("envelops.id", "=", target.envelopId)
            .executeTakeFirst();
        if (!row) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Envelope not found" });
        }
        return {
            spaceId: row.space_id,
            available: Number(row.remaining ?? 0),
        };
    }
    const row = await trx
        .selectFrom("plans")
        .leftJoin("plan_balances", "plan_balances.plan_id", "plans.id")
        .select(["plans.space_id", "plan_balances.allocated"])
        .where("plans.id", "=", target.planId)
        .executeTakeFirst();
    if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
    }
    return {
        spaceId: row.space_id,
        available: Number(row.allocated ?? 0),
    };
}
