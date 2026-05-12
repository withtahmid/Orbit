import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers, SpacePin, UserSpacePin } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Set or replace the pin for one field in one space.
 *
 * Scope is inferred from `field`:
 *   account   → user_space_pin  (any member)
 *   envelop   → space_pin       (owner | editor)
 *   event     → space_pin       (owner | editor)
 *
 * Idempotent: ON CONFLICT DO UPDATE — selecting a different entity for
 * the same field replaces the previous pin atomically.
 */
export const setPin = authorizedProcedure
    .input(
        z.discriminatedUnion("field", [
            z.object({
                spaceId: z.string().uuid(),
                field: z.literal("account"),
                accountId: z.string().uuid(),
            }),
            z.object({
                spaceId: z.string().uuid(),
                field: z.literal("envelop"),
                envelopId: z.string().uuid(),
            }),
            z.object({
                spaceId: z.string().uuid(),
                field: z.literal("event"),
                eventId: z.string().uuid(),
            }),
        ])
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                if (input.field === "account") {
                    await resolveSpaceMembership({
                        trx,
                        spaceId: input.spaceId,
                        userId: ctx.auth.user.id,
                        roles: [
                            "owner",
                            "editor",
                            "viewer",
                        ] as unknown as SpaceMembers["role"][],
                    });

                    /* Account must be shared into this space, otherwise
                       the pin would point at an entity the user can't
                       use in this form. */
                    const shared = await trx
                        .selectFrom("space_accounts")
                        .select(["account_id"])
                        .where("space_id", "=", input.spaceId)
                        .where("account_id", "=", input.accountId)
                        .executeTakeFirst();
                    if (!shared) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: "Account is not available in this space",
                        });
                    }

                    return trx
                        .insertInto("user_space_pin")
                        .values({
                            user_id: ctx.auth.user.id,
                            space_id: input.spaceId,
                            field: "account" as unknown as UserSpacePin["field"],
                            account_id: input.accountId,
                        })
                        .onConflict((oc) =>
                            oc.columns(["user_id", "space_id", "field"]).doUpdateSet({
                                account_id: input.accountId,
                                updated_at: sql`NOW()`,
                            })
                        )
                        .returning(["user_id", "space_id", "field", "account_id"])
                        .executeTakeFirstOrThrow();
                }

                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                });

                if (input.field === "envelop") {
                    const envelop = await trx
                        .selectFrom("envelops")
                        .select(["id"])
                        .where("id", "=", input.envelopId)
                        .where("space_id", "=", input.spaceId)
                        .where("archived", "=", false)
                        .executeTakeFirst();
                    if (!envelop) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: "Envelope not found or archived",
                        });
                    }

                    return trx
                        .insertInto("space_pin")
                        .values({
                            space_id: input.spaceId,
                            field: "envelop" as unknown as SpacePin["field"],
                            envelop_id: input.envelopId,
                            event_id: null,
                            set_by_user_id: ctx.auth.user.id,
                        })
                        .onConflict((oc) =>
                            oc.columns(["space_id", "field"]).doUpdateSet({
                                envelop_id: input.envelopId,
                                event_id: null,
                                set_by_user_id: ctx.auth.user.id,
                                updated_at: sql`NOW()`,
                            })
                        )
                        .returning([
                            "space_id",
                            "field",
                            "envelop_id",
                            "event_id",
                            "set_by_user_id",
                        ])
                        .executeTakeFirstOrThrow();
                }

                const event = await trx
                    .selectFrom("events")
                    .select(["id", "status"])
                    .where("id", "=", input.eventId)
                    .where("space_id", "=", input.spaceId)
                    .executeTakeFirst();
                if (!event || event.status !== "active") {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Event not found or not active",
                    });
                }

                return trx
                    .insertInto("space_pin")
                    .values({
                        space_id: input.spaceId,
                        field: "event" as unknown as SpacePin["field"],
                        envelop_id: null,
                        event_id: input.eventId,
                        set_by_user_id: ctx.auth.user.id,
                    })
                    .onConflict((oc) =>
                        oc.columns(["space_id", "field"]).doUpdateSet({
                            envelop_id: null,
                            event_id: input.eventId,
                            set_by_user_id: ctx.auth.user.id,
                            updated_at: sql`NOW()`,
                        })
                    )
                    .returning([
                        "space_id",
                        "field",
                        "envelop_id",
                        "event_id",
                        "set_by_user_id",
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
                message: error.message || "Failed to set pin",
            });
        }

        return result;
    });
