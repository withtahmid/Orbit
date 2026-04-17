import { TRPCError } from "@trpc/server";
import { Kysely } from "kysely";
import { z } from "zod";
import type { DB, SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { resolveEnvelopePeriodBalance } from "../envelop/utils/resolveEnvelopePeriodBalance.mjs";
import { resolvePlanBalance } from "../plan/utils/resolvePlanBalance.mjs";
import {
    effectivePeriodStart,
    type Cadence,
} from "../envelop/utils/periodWindow.mjs";

/**
 * Transfer allocation between any two (envelope|plan, optional-account)
 * partitions in the same space. Used for:
 *   - Rebalancing drift (same envelope, cross-account)
 *   - Moving funds between envelopes / plans
 *   - Converting unassigned-pool allocations into account-pinned ones
 *
 * Both source and destination carry an optional `accountId`. null means
 * "unassigned pool." For envelope targets, the period is current-period of
 * the envelope's cadence (callers can't retarget historical periods —
 * auditable history matters more than flexibility here).
 */

const envelopTarget = z.object({
    kind: z.literal("envelop"),
    envelopId: z.string().uuid(),
    accountId: z.string().uuid().nullable().optional(),
});
const planTarget = z.object({
    kind: z.literal("plan"),
    planId: z.string().uuid(),
    accountId: z.string().uuid().nullable().optional(),
});
const targetSchema = z.discriminatedUnion("kind", [envelopTarget, planTarget]);

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

                if (sameTarget(input.from, input.to)) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Source and destination cannot be the same partition",
                    });
                }

                await resolveSpaceMembership({
                    trx,
                    spaceId: fromInfo.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                });

                // Verify any pinned account belongs to the space
                for (const accountId of [
                    targetAccountId(input.from),
                    targetAccountId(input.to),
                ]) {
                    if (accountId) {
                        const sa = await trx
                            .selectFrom("space_accounts")
                            .select("account_id")
                            .where("account_id", "=", accountId)
                            .where("space_id", "=", fromInfo.spaceId)
                            .executeTakeFirst();
                        if (!sa) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message: "Account does not belong to this space",
                            });
                        }
                    }
                }

                // Source partition must have enough to give. Surface the
                // available number via `cause` so the client can format
                // it with MoneyDisplay instead of re-parsing the string.
                if (fromInfo.available < input.amount) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Source has insufficient available balance",
                        cause: { available: fromInfo.available },
                    });
                }

                // Debit source
                if (input.from.kind === "envelop") {
                    await trx
                        .insertInto("envelop_allocations")
                        .values({
                            envelop_id: input.from.envelopId,
                            amount: -input.amount,
                            created_by: ctx.auth.user.id,
                            account_id: input.from.accountId ?? null,
                            period_start: fromInfo.periodStart ?? null,
                        })
                        .execute();
                } else {
                    await trx
                        .insertInto("plan_allocations")
                        .values({
                            plan_id: input.from.planId,
                            amount: -input.amount,
                            created_by: ctx.auth.user.id,
                            account_id: input.from.accountId ?? null,
                        })
                        .execute();
                }

                // Credit destination
                if (input.to.kind === "envelop") {
                    await trx
                        .insertInto("envelop_allocations")
                        .values({
                            envelop_id: input.to.envelopId,
                            amount: input.amount,
                            created_by: ctx.auth.user.id,
                            account_id: input.to.accountId ?? null,
                            period_start: toInfo.periodStart ?? null,
                        })
                        .execute();
                } else {
                    await trx
                        .insertInto("plan_allocations")
                        .values({
                            plan_id: input.to.planId,
                            amount: input.amount,
                            created_by: ctx.auth.user.id,
                            account_id: input.to.accountId ?? null,
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
): Promise<{
    spaceId: string;
    available: number;
    periodStart: Date | null;
}> {
    if (target.kind === "envelop") {
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
            accountId: target.accountId ?? null,
            at: now,
        });
        return {
            spaceId: envelope.space_id,
            available: bal.remaining,
            periodStart,
        };
    }

    const plan = await trx
        .selectFrom("plans")
        .select("space_id")
        .where("id", "=", target.planId)
        .executeTakeFirst();
    if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
    }
    const bal = await resolvePlanBalance({
        trx,
        planId: target.planId,
        accountId: target.accountId ?? null,
    });
    return { spaceId: plan.space_id, available: bal.allocated, periodStart: null };
}

function targetAccountId(t: Target): string | null {
    return t.accountId ?? null;
}

function sameTarget(a: Target, b: Target): boolean {
    if (a.kind !== b.kind) return false;
    const aAcct = a.accountId ?? null;
    const bAcct = b.accountId ?? null;
    if (a.kind === "envelop" && b.kind === "envelop") {
        return a.envelopId === b.envelopId && aAcct === bAcct;
    }
    if (a.kind === "plan" && b.kind === "plan") {
        return a.planId === b.planId && aAcct === bAcct;
    }
    return false;
}
