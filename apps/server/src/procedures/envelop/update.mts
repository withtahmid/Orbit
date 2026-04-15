import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import { sql } from "kysely";

export const updateEnvelop = authorizedProcedure
    .input(
        z.object({
            envelopId: z.string().uuid(),
            name: z.string().min(1).max(255),
        })
    )
    .output(
        z.object({
            id: z.string().uuid(),
            space_id: z.string().uuid(),
            name: z.string(),
            created_at: z.date(),
            updated_at: z.date().nullable(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const envelop = await trx
                    .selectFrom("envelops")
                    .select(["id", "space_id"])
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
                    roles: ["owner"] as unknown as SpaceMembers["role"][],
                });

                return trx
                    .updateTable("envelops")
                    .set({
                        name: input.name,
                        updated_at: sql`now()`,
                    })
                    .where("envelops.id", "=", input.envelopId)
                    .returning(["id", "space_id", "name", "created_at", "updated_at"])
                    .executeTakeFirstOrThrow();
            })
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to update envelop",
            });
        }

        return result;
    });
