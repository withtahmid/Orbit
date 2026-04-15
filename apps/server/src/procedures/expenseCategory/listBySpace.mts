import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const listExpenseCategoriesBySpace = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
        })
    )
    .output(
        z.array(
            z.object({
                id: z.string().uuid(),
                space_id: z.string().uuid(),
                parent_id: z.string().uuid().nullable(),
                envelop_id: z.string().uuid(),
                name: z.string(),
                created_at: z.date(),
                updated_at: z.date().nullable(),
            })
        )
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as SpaceMembers["role"][],
                });

                return trx
                    .selectFrom("expense_categories")
                    .select([
                        "id",
                        "space_id",
                        "parent_id",
                        "envelop_id",
                        "name",
                        "created_at",
                        "updated_at",
                    ])
                    .where("expense_categories.space_id", "=", input.spaceId)
                    .orderBy("expense_categories.created_at", "asc")
                    .execute();
            })
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to fetch expense categories",
            });
        }

        return result;
    });
