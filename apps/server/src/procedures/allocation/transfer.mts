import { TRPCError } from "@trpc/server";
import { Kysely } from "kysely";
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
 * Transfer allocation between any two (envelope, optional-account)
 * partitions in the same space. Used for:
 *   - Rebalancing drift (same envelope, cross-account)
 *   - Moving funds between envelopes
 *   - Converting unassigned-pool allocations into account-pinned ones
 *
 * Both source and destination carry an optional `accountId`. null means
 * "unassigned pool." The period is current-period of the envelope's cadence
 * (callers can't retarget historical periods — auditable history matters
 * more than flexibility here).
 */

const targetSchema = z.object({
    envelopId: z.string().uuid(),
    accountId: z.string().uuid().nullable().optional(),
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
                        const fromInfo = await resolveTargetInfo(trx, input.from);
                        const toInfo = await resolveTargetInfo(trx, input.to);

                        if (fromInfo.spaceId !== toInfo.spaceId) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message:
                                    "Source and destination must be in the same space",
                            });
                        }

                        if (sameTarget(input.from, input.to)) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message:
                                    "Source and destination cannot be the same partition",
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

                        // Verify any pinned account belongs to the space
                        for (const accountId of [
                            input.from.accountId ?? null,
                            input.to.accountId ?? null,
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
                                        message:
                                            "Account does not belong to this space",
                                    });
                                }
                            }
                        }

                        // Source partition must have enough to give.
                        if (fromInfo.available < input.amount) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message:
                                    "Source has insufficient available balance",
                                cause: { available: fromInfo.available },
                            });
                        }

                        // Debit source
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

                        // Credit destination
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

    // The available check and the row we write must scope to the same
    // partition. `target.accountId` can arrive as `undefined` (caller
    // omitted) or `null` (caller asked for the unassigned pool); the
    // insert collapses both to NULL, so the check must too — otherwise
    // an "aggregate available" lookup happily debits a partition that
    // does not actually hold the money.
    const accountId: string | null = target.accountId ?? null;
    const bal = await resolveEnvelopePeriodBalance({
        trx,
        envelopId: target.envelopId,
        accountId,
        at: now,
    });
    return {
        spaceId: envelope.space_id,
        available: bal.remaining,
        periodStart,
    };
}

function sameTarget(a: Target, b: Target): boolean {
    const aAcct = a.accountId ?? null;
    const bAcct = b.accountId ?? null;
    return a.envelopId === b.envelopId && aAcct === bAcct;
}
