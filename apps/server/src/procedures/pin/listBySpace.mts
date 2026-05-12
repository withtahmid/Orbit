import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers, SpacePin, UserSpacePin } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Returns the caller's effective pins for one space.
 *
 * Account is sourced from `user_space_pin` (per-user) and limited to an
 * account currently shared into the space. Envelope and Event are
 * sourced from `space_pin` (shared) and filtered to active entities
 * (envelope.archived = false, event.status = 'active'). When a pinned
 * entity is archived or unshared, this procedure returns null for that
 * field; the row in the pin table stays put — the FK cascade has not
 * fired because archiving is non-destructive — but the form behaves as
 * if no pin is set. That's the intended silent-fallback semantics.
 */
export const listPinsBySpace = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            (async () => {
                await resolveSpaceMembership({
                    trx: ctx.services.qb,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor", "viewer"] as unknown as SpaceMembers["role"][],
                });

                const accountRow = await ctx.services.qb
                    .selectFrom("user_space_pin as p")
                    .innerJoin("accounts as a", "a.id", "p.account_id")
                    .innerJoin("space_accounts as sa", "sa.account_id", "a.id")
                    .where("p.user_id", "=", ctx.auth.user.id)
                    .where("p.space_id", "=", input.spaceId)
                    .where("p.field", "=", "account" as unknown as UserSpacePin["field"])
                    .where("sa.space_id", "=", input.spaceId)
                    .select(["a.id", "a.name", "a.account_type", "a.color", "a.icon"])
                    .executeTakeFirst();

                const envelopRow = await ctx.services.qb
                    .selectFrom("space_pin as p")
                    .innerJoin("envelops as e", "e.id", "p.envelop_id")
                    .where("p.space_id", "=", input.spaceId)
                    .where("p.field", "=", "envelop" as unknown as SpacePin["field"])
                    .where("e.archived", "=", false)
                    /* Belt-and-suspenders: today `pin.set` only inserts
                       intra-space rows, so the JOIN target's space_id
                       always matches. But a future bulk import or admin
                       script that violates that invariant must not leak
                       cross-space pin data to this query. Cheap to add. */
                    .where("e.space_id", "=", input.spaceId)
                    .select(["e.id", "e.name", "e.color", "e.icon", "p.set_by_user_id"])
                    .executeTakeFirst();

                const eventRow = await ctx.services.qb
                    .selectFrom("space_pin as p")
                    .innerJoin("events as ev", "ev.id", "p.event_id")
                    .where("p.space_id", "=", input.spaceId)
                    .where("p.field", "=", "event" as unknown as SpacePin["field"])
                    .where("ev.status", "=", "active")
                    .where("ev.space_id", "=", input.spaceId)
                    .select(["ev.id", "ev.name", "ev.color", "ev.icon", "p.set_by_user_id"])
                    .executeTakeFirst();

                return {
                    account: accountRow
                        ? {
                              id: accountRow.id,
                              name: accountRow.name,
                              account_type: accountRow.account_type as unknown as
                                  | "asset"
                                  | "liability"
                                  | "locked",
                              color: accountRow.color,
                              icon: accountRow.icon,
                          }
                        : null,
                    envelop: envelopRow
                        ? {
                              id: envelopRow.id,
                              name: envelopRow.name,
                              color: envelopRow.color,
                              icon: envelopRow.icon,
                              setByUserId: envelopRow.set_by_user_id,
                          }
                        : null,
                    event: eventRow
                        ? {
                              id: eventRow.id,
                              name: eventRow.name,
                              color: eventRow.color,
                              icon: eventRow.icon,
                              setByUserId: eventRow.set_by_user_id,
                          }
                        : null,
                };
            })()
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to fetch pins",
            });
        }

        return result;
    });
