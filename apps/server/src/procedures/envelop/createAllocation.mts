import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { resolveEnvelopePeriodBalance } from "./utils/resolveEnvelopePeriodBalance.mjs";
import {
    appTzMonthStartString,
    effectivePeriodStart,
    type Cadence,
} from "./utils/periodWindow.mjs";
import { withIdempotency } from "../../utils/withIdempotency.mjs";

/**
 * Create or update an envelope allocation — positive to allocate, negative
 * to deallocate. There is exactly ONE allocation row per (envelope, month)
 * for monthly envelopes, and one lifetime row (period_start NULL) for
 * rolling/goal envelopes. Allocating or deallocating UPSERTs that single
 * row, accumulating the delta — there is no per-change history.
 *
 *   - `periodStart` (optional, monthly only): which month this applies to.
 *     Defaults to the month containing today; ignored for cadence='none'.
 *   - `idempotencyKey` (optional): a second call with the same key returns
 *     the cached row instead of applying the delta twice.
 *
 * Balance checks:
 *   - Positive (allocating): no guard. Over-allocation is *intent*; the UI
 *     reports the soft "planned > funded" status from analytics.
 *   - Negative (deallocating): the only invariant is that the budget can't go
 *     below zero. We do NOT block pulling the budget below what's already been
 *     spent — the allocation is a freely-editable planning number, not a cash
 *     reserve. Deallocating an overspent envelope frees no cash anyway (its
 *     held = max(0, allocated − consumed) is already 0), so the Unbudgeted
 *     pool is protected by that clamp regardless of how low the budget goes.
 */
export const createEnvelopAllocation = authorizedProcedure
    .input(
        z.object({
            envelopId: z.string().uuid(),
            amount: z.number().refine((v) => v !== 0, {
                message: "Amount must not be zero",
            }),
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
                            // Lock the envelope row for this transaction so a
                            // concurrent allocate/deallocate/transfer on the
                            // same envelope serializes behind us — the
                            // deallocation guard below reads-then-upserts, and
                            // without the lock two concurrent pulls could both
                            // pass the guard against a stale balance and drive
                            // the row negative.
                            .forUpdate()
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

                        const cadence = envelop.cadence as Cadence;
                        const nowRef = new Date();
                        // `effPeriod` (an instant) still drives the period
                        // window for the balance guard below. The value STORED
                        // into the tz-less `period_start` column is an explicit
                        // APP_TZ date string so it can't drift with session tz.
                        const effPeriod = effectivePeriodStart(
                            cadence,
                            input.periodStart ?? null,
                            nowRef
                        );
                        const storedPeriodStart =
                            cadence === "none"
                                ? null
                                : appTzMonthStartString(
                                      input.periodStart ?? nowRef
                                  );

                        if (input.amount < 0) {
                            // Deallocating: the only guard is that the budget
                            // (allocated) can't go negative. `remaining` is
                            // deliberately NOT used here — pulling the budget
                            // below what's already spent is a valid edit of a
                            // planning number and frees no cash (the held
                            // clamp keeps the pool correct). See header note.
                            const bal = await resolveEnvelopePeriodBalance({
                                trx,
                                envelopId: input.envelopId,
                                at: effPeriod,
                            });
                            if (bal.allocated + input.amount < 0) {
                                throw new TRPCError({
                                    code: "BAD_REQUEST",
                                    message: `Envelope budget is ${bal.allocated.toFixed(2)} — you can't deallocate more than that.`,
                                });
                            }
                        }

                        return trx
                            .insertInto("envelop_allocations")
                            .values({
                                envelop_id: input.envelopId,
                                amount: input.amount,
                                created_by: ctx.auth.user.id,
                                period_start: storedPeriodStart,
                            })
                            .onConflict((oc) =>
                                oc
                                    .columns(["envelop_id", "period_start"])
                                    .doUpdateSet({
                                        amount: sql`envelop_allocations.amount + excluded.amount`,
                                        created_by: (eb) =>
                                            eb.ref("excluded.created_by"),
                                    })
                            )
                            .returning([
                                "id",
                                "envelop_id",
                                "amount",
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
