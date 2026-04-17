import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { resolveSpaceUnallocated } from "../allocation/utils/resolveSpaceUnallocated.mjs";
import { resolveEnvelopePeriodBalance } from "./utils/resolveEnvelopePeriodBalance.mjs";
import { effectivePeriodStart, type Cadence } from "./utils/periodWindow.mjs";

/**
 * Create an envelope allocation — positive to allocate, negative to
 * deallocate. New optional scoping:
 *
 *   - `accountId` (optional): pin this allocation to a specific account.
 *     Null/omitted = unassigned pool.
 *   - `periodStart` (optional, for monthly cadence): which period this
 *     allocation applies to. Defaults to the period containing today
 *     for monthly envelopes; irrelevant for cadence='none'.
 *
 * Balance checks:
 *   - Positive (allocating): must have enough unallocated space-cash.
 *   - Negative (deallocating): can't pull more than the partition's
 *     current-period remaining, to prevent the partition from going
 *     artificially negative via deallocation (real spending can still
 *     push it negative — that's drift, not prevented here).
 */
export const createEnvelopAllocation = authorizedProcedure
    .input(
        z.object({
            envelopId: z.string().uuid(),
            amount: z.number().refine((v) => v !== 0, {
                message: "Amount must not be zero",
            }),
            accountId: z.string().uuid().nullable().optional(),
            periodStart: z.coerce.date().nullable().optional(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const envelop = await trx
                    .selectFrom("envelops")
                    .select(["id", "space_id", "cadence"])
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
                    roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                });

                // Validate account-belongs-to-space if pinned
                if (input.accountId) {
                    const sa = await trx
                        .selectFrom("space_accounts")
                        .select("account_id")
                        .where("account_id", "=", input.accountId)
                        .where("space_id", "=", envelop.space_id)
                        .executeTakeFirst();
                    if (!sa) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: "Account does not belong to this space",
                        });
                    }
                }

                // Compute effective period_start once so queries + storage match.
                const nowRef = new Date();
                const effPeriod = effectivePeriodStart(
                    envelop.cadence as Cadence,
                    input.periodStart ?? null,
                    nowRef
                );
                const storedPeriodStart =
                    (envelop.cadence as Cadence) === "none" ? null : effPeriod;

                if (input.amount > 0) {
                    // Allocating: space must have enough unallocated cash
                    const free = await resolveSpaceUnallocated({
                        trx,
                        spaceId: envelop.space_id,
                    });
                    if (free < input.amount) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: `Only ${free.toFixed(2)} is unallocated. Increase income or pull from another envelope/plan first.`,
                        });
                    }
                } else {
                    // Deallocating: the target partition for this period must
                    // have enough remaining to cover the pull without going
                    // artificially negative.
                    const bal = await resolveEnvelopePeriodBalance({
                        trx,
                        envelopId: input.envelopId,
                        accountId: input.accountId ?? null,
                        at: effPeriod,
                    });
                    if (bal.remaining + input.amount < 0) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: `Partition only has ${bal.remaining.toFixed(2)} available to deallocate.`,
                        });
                    }
                }

                return trx
                    .insertInto("envelop_allocations")
                    .values({
                        envelop_id: input.envelopId,
                        amount: input.amount,
                        created_by: ctx.auth.user.id,
                        account_id: input.accountId ?? null,
                        period_start: storedPeriodStart,
                    })
                    .returning([
                        "id",
                        "envelop_id",
                        "amount",
                        "account_id",
                        "period_start",
                        "created_at",
                        "created_by",
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
                message: error.message || "Failed to create envelop allocation",
            });
        }

        return result;
    });
