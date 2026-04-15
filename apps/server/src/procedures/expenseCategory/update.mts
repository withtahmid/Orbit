import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const updateExpenseCategory = authorizedProcedure
    .input(
        z
            .object({
                categoryId: z.string().uuid(),
                name: z.string().min(1).max(255).optional(),
                envelopId: z.string().uuid().optional(),
            })
            .refine((data) => data.name !== undefined || data.envelopId !== undefined, {
                message: "At least one field must be provided",
            })
    )
    .output(
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
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const current = await trx
                    .selectFrom("expense_categories")
                    .select(["id", "space_id"])
                    .where("expense_categories.id", "=", input.categoryId)
                    .executeTakeFirst();

                if (!current) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Expense category not found",
                    });
                }

                await resolveSpaceMembership({
                    trx,
                    spaceId: current.space_id,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as SpaceMembers["role"][],
                });

                if (input.envelopId) {
                    const envelop = await trx
                        .selectFrom("envelops")
                        .select(["id", "space_id"])
                        .where("envelops.id", "=", input.envelopId)
                        .executeTakeFirst();

                    if (!envelop || envelop.space_id !== current.space_id) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: "Invalid envelop for this space",
                        });
                    }
                }

                return trx
                    .updateTable("expense_categories")
                    .set({
                        name: input.name,
                        envelop_id: input.envelopId,
                        updated_at: new Date(),
                    })
                    .where("expense_categories.id", "=", input.categoryId)
                    .returning([
                        "id",
                        "space_id",
                        "parent_id",
                        "envelop_id",
                        "name",
                        "created_at",
                        "updated_at",
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
                message: error.message || "Failed to update expense category",
            });
        }

        return result;
    });
