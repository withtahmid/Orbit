import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers, SpacePin, UserSpacePin } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Clear the pin for one field in one space.
 *
 * Scope is inferred from `field` (same rules as pin.set). No-op when no
 * pin row exists — clearing an already-unset pin returns ok silently.
 */
export const clearPin = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            field: z.enum(["account", "envelop", "event"]),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error] = await safeAwait(
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

                    await trx
                        .deleteFrom("user_space_pin")
                        .where("user_id", "=", ctx.auth.user.id)
                        .where("space_id", "=", input.spaceId)
                        .where(
                            "field",
                            "=",
                            "account" as unknown as UserSpacePin["field"]
                        )
                        .execute();
                    return;
                }

                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
                });

                await trx
                    .deleteFrom("space_pin")
                    .where("space_id", "=", input.spaceId)
                    .where("field", "=", input.field as unknown as SpacePin["field"])
                    .execute();
            })
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to clear pin",
            });
        }

        return { ok: true };
    });
