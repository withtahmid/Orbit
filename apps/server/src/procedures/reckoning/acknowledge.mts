import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { resolveOwnedAccountIds } from "../personal/shared.mjs";
import { withIdempotency } from "../../utils/withIdempotency.mjs";

/**
 * Mark a past-month overspend as resolved by the current user.
 *
 * The actual resolution work (pulling, borrowing) is performed by the
 * existing procedures (`allocation.transfer`, `envelop.borrowFromNextMonth`).
 * This procedure ONLY records the user's acknowledgment so the dashboard
 * banner can clear and the reckoning UI doesn't re-prompt.
 *
 * Idempotency-safe: re-acknowledging the same period is a harmless
 * upsert. The PK on (space_id, envelop_id, user_id, period_start) makes
 * this atomic without an explicit UPSERT clause — we just catch the
 * conflict via DO NOTHING.
 */
export const acknowledgeReckoning = authorizedProcedure
    .input(
        z.object({
            envelopId: z.string().uuid(),
            periodStart: z.coerce.date(),
            resolution: z.enum(["pulled", "borrowed", "absorbed"]),
            idempotencyKey: z.string().uuid().optional(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) =>
                withIdempotency({
                    trx,
                    userId: ctx.auth.user.id,
                    operation: "reckoning.acknowledge",
                    key: input.idempotencyKey,
                    fn: async () => {
                        const envelop = await trx
                            .selectFrom("envelops")
                            .select(["id", "space_id", "cadence"])
                            .where("id", "=", input.envelopId)
                            .executeTakeFirst();
                        if (!envelop) {
                            throw new TRPCError({
                                code: "NOT_FOUND",
                                message: "Envelope not found",
                            });
                        }

                        await resolveSpaceMembership({
                            trx,
                            spaceId: envelop.space_id,
                            userId: ctx.auth.user.id,
                            roles: [
                                "owner",
                                "editor",
                                "viewer",
                            ] as unknown as SpaceMembers["role"][],
                        });

                        // Clamp the client-supplied period to a calendar
                        // month start. Without this, an arbitrary date
                        // could be acknowledged that listPending would
                        // never surface — leaving stale rows in the table
                        // and (more importantly) silently bypassing the
                        // strict-mode gate's `period_start` lookup.
                        const clamped = await sql<{ m: string }>`
                            SELECT DATE_TRUNC('month', ${input.periodStart}::timestamp)::date::text AS m
                        `
                            .execute(trx)
                            .then((r) => r.rows[0]?.m);
                        if (!clamped) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message: "Invalid period start",
                            });
                        }

                        // Verify the period is actually a settled past
                        // month for a monthly envelope and is genuinely
                        // overspent. Otherwise reject — this prevents a
                        // malicious client from preemptively ack'ing
                        // future months to bypass strict-mode gating.
                        //
                        // Accept if EITHER the space-wide overspend OR
                        // the caller's user-slice overspend is positive.
                        // The space view of listPending shows the former,
                        // the personal view shows the latter; whichever
                        // surface the user clicked from must be ack'able.
                        const ownedAccountIds = await resolveOwnedAccountIds(
                            trx,
                            ctx.auth.user.id
                        );
                        const ownedParam =
                            ownedAccountIds.length === 0
                                ? ["00000000-0000-0000-0000-000000000000"]
                                : ownedAccountIds;

                        const overspentRow = await sql<{
                            over_space: string;
                            over_user: string;
                        }>`
                            WITH spend AS (
                                SELECT t.amount, t.source_account_id
                                FROM transactions t
                                WHERE t.envelop_id = ${envelop.id}
                                  AND t.type = 'expense'
                                  AND t.transaction_datetime >= ${clamped}::date
                                  AND t.transaction_datetime < (${clamped}::date + INTERVAL '1 month')
                            ),
                            allocated AS (
                                SELECT COALESCE(SUM(a.amount), 0) AS total
                                FROM envelop_allocations a
                                WHERE a.envelop_id = ${envelop.id}
                                  AND COALESCE(
                                        a.period_start,
                                        DATE_TRUNC('month', a.created_at)::date
                                      ) = ${clamped}::date
                            )
                            SELECT
                                (COALESCE((SELECT SUM(amount) FROM spend), 0)
                                    - (SELECT total FROM allocated))::text AS over_space,
                                (COALESCE((
                                    SELECT SUM(amount) FROM spend
                                    WHERE source_account_id = ANY(${ownedParam}::uuid[])
                                ), 0)
                                    - (SELECT total FROM allocated))::text AS over_user
                        `
                            .execute(trx)
                            .then((r) => r.rows[0]);
                        const overspent = Math.max(
                            Number(overspentRow?.over_space ?? 0),
                            Number(overspentRow?.over_user ?? 0)
                        );

                        const isPastSettledMonth = await sql<{ ok: boolean }>`
                            SELECT (${clamped}::date + INTERVAL '1 month' <= DATE_TRUNC('month', NOW()))::boolean AS ok
                        `
                            .execute(trx)
                            .then((r) => Boolean(r.rows[0]?.ok));

                        if (
                            envelop.cadence !== "monthly" ||
                            !isPastSettledMonth ||
                            overspent <= 0
                        ) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message:
                                    "Period is not a past-month overspend for this envelope",
                            });
                        }

                        await trx
                            .insertInto("reckoning_acknowledgments")
                            .values({
                                space_id: envelop.space_id,
                                envelop_id: input.envelopId,
                                user_id: ctx.auth.user.id,
                                period_start: clamped,
                                resolution: input.resolution,
                            })
                            .onConflict((oc) =>
                                oc
                                    .columns([
                                        "space_id",
                                        "envelop_id",
                                        "user_id",
                                        "period_start",
                                    ])
                                    .doNothing()
                            )
                            .execute();

                        return {
                            envelopId: input.envelopId,
                            resolution: input.resolution,
                        };
                    },
                })
            )
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to acknowledge reckoning",
            });
        }
        return result;
    });
