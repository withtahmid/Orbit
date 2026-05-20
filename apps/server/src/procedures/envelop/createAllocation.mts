import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { resolveEnvelopePeriodBalance } from "./utils/resolveEnvelopePeriodBalance.mjs";
import { effectivePeriodStart, type Cadence } from "./utils/periodWindow.mjs";
import { withIdempotency } from "../../utils/withIdempotency.mjs";

/**
 * Create an envelope allocation — positive to allocate, negative to
 * deallocate. Allocations are *intent*: the user can plan more than
 * they currently have funded. Visibility lives on the envelope dashboard
 * (planned vs funded).
 *
 *   - `accountId` (optional, legacy): pin to a specific account. New UI
 *     no longer surfaces this; always passes null. Kept nullable for
 *     back-compat with existing rows.
 *   - `periodStart` (optional, for monthly cadence): which period this
 *     allocation applies to. Defaults to the period containing today
 *     for monthly envelopes; irrelevant for cadence='none'.
 *   - `idempotencyKey` (optional): client-supplied UUID. A second call
 *     with the same key returns the cached row instead of creating a
 *     duplicate allocation.
 *
 * Balance checks:
 *   - Positive (allocating): no balance guard. Soft "over-allocation" is
 *     reported by the UI from `analytics.spaceSummary.unallocated`.
 *   - Negative (deallocating): can't pull more than the envelope's
 *     current-period remaining, to prevent it from going artificially
 *     negative via deallocation.
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
            idempotencyKey: z.string().uuid().optional(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) =>
                withIdempotency({
                    trx,
                    userId: ctx.auth.user.id,
                    operation: "envelop.allocationCreate",
                    key: input.idempotencyKey,
                    fn: async () => {
                        const envelop = await trx
                            .selectFrom("envelops")
                            .select([
                                "id",
                                "space_id",
                                "cadence",
                                "archived",
                                "name",
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
                            roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                        });

                        // Block ALLOCATING to an archived envelope; allow
                        // DEALLOCATING (so the user can free up trapped
                        // cash from a retired envelope without unarchiving).
                        // Runs after the membership check so the error
                        // message can't be used to probe envelope names
                        // cross-space.
                        if (envelop.archived && input.amount > 0) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message: `Envelope "${envelop.name}" is archived. Unarchive it first to allocate.`,
                            });
                        }

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
                                    message:
                                        "Account does not belong to this space",
                                });
                            }
                        }

                        // Compute effective period_start once so queries
                        // + storage match.
                        const nowRef = new Date();
                        const effPeriod = effectivePeriodStart(
                            envelop.cadence as Cadence,
                            input.periodStart ?? null,
                            nowRef
                        );
                        const storedPeriodStart =
                            (envelop.cadence as Cadence) === "none"
                                ? null
                                : effPeriod;

                        if (input.amount > 0) {
                            // Allocating is *intent* — over-allocation is
                            // allowed. The UI reports the soft "planned >
                            // funded" status from analytics.spaceSummary.
                        } else {
                            // Deallocating: target partition for this
                            // period must have enough remaining to cover
                            // the pull without going artificially negative.
                            //
                            // accountId scoping: the new UI always passes
                            // `null` (intent is space-wide). For that case,
                            // check against the envelope's top-line /
                            // aggregate remaining so legacy account-pinned
                            // allocations contribute their balance. Only
                            // when an explicit string accountId is provided
                            // (legacy partition-fixing flow) do we scope
                            // to that specific partition.
                            const accountScope =
                                input.accountId == null
                                    ? undefined
                                    : input.accountId;
                            const bal = await resolveEnvelopePeriodBalance({
                                trx,
                                envelopId: input.envelopId,
                                accountId: accountScope,
                                at: effPeriod,
                            });
                            if (bal.remaining + input.amount < 0) {
                                throw new TRPCError({
                                    code: "BAD_REQUEST",
                                    message: `Envelope only has ${bal.remaining.toFixed(2)} available to deallocate.`,
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
                message: error.message || "Failed to create envelop allocation",
            });
        }

        return result;
    });
