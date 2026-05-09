import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * List active borrow obligations for an envelope, grouped by `borrowed_link_id`.
 *
 * Each link has two rows: a positive amount in the period that received
 * the borrow ("borrowedTo") and a negative amount in the period that
 * owes it back ("borrowedFrom"). We return only links whose owe-back
 * row is in a period that hasn't passed yet — those still represent
 * future obligations the user should be aware of.
 *
 * Used by:
 *   - Archive confirm dialog: warn that archiving leaves $X borrowed
 *     against future periods that won't auto-resolve.
 *   - Envelope detail "undo borrow" UI: lists each open link with a
 *     button to delete both rows atomically.
 */
export const listBorrows = authorizedProcedure
    .input(
        z.object({
            envelopId: z.string().uuid(),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            (async () => {
                const envelop = await ctx.services.qb
                    .selectFrom("envelops")
                    .select(["space_id"])
                    .where("id", "=", input.envelopId)
                    .executeTakeFirst();

                if (!envelop) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Envelope not found",
                    });
                }

                await resolveSpaceMembership({
                    trx: ctx.services.qb,
                    spaceId: envelop.space_id,
                    userId: ctx.auth.user.id,
                    roles: [
                        "owner",
                        "editor",
                        "viewer",
                    ] as unknown as SpaceMembers["role"][],
                });

                // Pre-filter at the DB level: only return rows whose
                // borrow link still has its owe-back period in the
                // current month or later — OR where the negative half
                // is missing entirely (malformed / orphaned link the
                // UI should still surface). Doing the comparison in
                // SQL avoids JS/Postgres TZ skew on `period_start`.
                const rows = await sql<{
                    id: string;
                    borrowed_link_id: string;
                    amount: string;
                    period_start: Date | null;
                    created_at: Date;
                }>`
                    SELECT id, borrowed_link_id, amount, period_start, created_at
                    FROM envelop_allocations a
                    WHERE a.envelop_id = ${input.envelopId}
                      AND a.borrowed_link_id IS NOT NULL
                      AND (
                          -- The link has a negative half whose period
                          -- is current-or-future.
                          EXISTS (
                              SELECT 1
                              FROM envelop_allocations neg
                              WHERE neg.borrowed_link_id = a.borrowed_link_id
                                AND neg.amount < 0
                                AND COALESCE(
                                      neg.period_start,
                                      DATE_TRUNC('month', neg.created_at)::date
                                    ) >= DATE_TRUNC('month', NOW())::date
                          )
                          -- OR the link has no negative half at all
                          -- (malformed; surface so the user can clean up).
                          OR NOT EXISTS (
                              SELECT 1
                              FROM envelop_allocations neg
                              WHERE neg.borrowed_link_id = a.borrowed_link_id
                                AND neg.amount < 0
                          )
                      )
                    ORDER BY created_at ASC
                `
                    .execute(ctx.services.qb)
                    .then((r) => r.rows);

                // Group rows by link_id; emit one entry per group.
                const byLink = new Map<
                    string,
                    {
                        linkId: string;
                        amount: number;
                        currentPeriodStart: Date | null;
                        nextPeriodStart: Date | null;
                        createdAt: Date;
                    }
                >();
                for (const r of rows) {
                    if (!r.borrowed_link_id) continue;
                    const existing = byLink.get(r.borrowed_link_id);
                    const amount = Math.abs(Number(r.amount));
                    const isPositive = Number(r.amount) > 0;
                    if (existing) {
                        if (isPositive) {
                            existing.currentPeriodStart = r.period_start;
                        } else {
                            existing.nextPeriodStart = r.period_start;
                        }
                    } else {
                        byLink.set(r.borrowed_link_id, {
                            linkId: r.borrowed_link_id,
                            amount,
                            currentPeriodStart: isPositive
                                ? r.period_start
                                : null,
                            nextPeriodStart: !isPositive
                                ? r.period_start
                                : null,
                            createdAt: r.created_at,
                        });
                    }
                }

                // SQL already filtered to current/future links; just sort.
                return Array.from(byLink.values()).sort(
                    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
                );
            })()
        );

        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to list borrows",
            });
        }
        return result ?? [];
    });
