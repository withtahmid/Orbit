import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const listEnvelopsBySpace = authorizedProcedure
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

                return ctx.services.qb
                    .selectFrom("envelops")
                    .select([
                        "id",
                        "space_id",
                        "name",
                        "color",
                        "icon",
                        "description",
                        "cadence",
                        "carry_over",
                        "created_at",
                        "updated_at",
                    ])
                    .where("envelops.space_id", "=", input.spaceId)
                    .orderBy("envelops.created_at", "asc")
                    .execute();
            })()
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to fetch envelops",
            });
        }

        return result ?? [];
    });
