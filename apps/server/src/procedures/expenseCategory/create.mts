import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

const HEX = /^#[0-9a-fA-F]{6}$/;

export const createExpenseCategory = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            name: z.string().min(1).max(255),
            parentId: z.string().uuid().nullable().optional(),
            envelopId: z.string().uuid(),
            color: z.string().regex(HEX).optional(),
            icon: z.string().min(1).max(48).optional(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as SpaceMembers["role"][],
                });

                if (input.parentId) {
                    const parent = await trx
                        .selectFrom("expense_categories")
                        .select(["id", "space_id", "envelop_id"])
                        .where("expense_categories.id", "=", input.parentId)
                        .executeTakeFirst();

                    if (!parent || parent.space_id !== input.spaceId) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: "Invalid parent category for this space",
                        });
                    }
                    if (parent.envelop_id !== input.envelopId) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message:
                                "Sub-categories must share the parent's envelope. Move the parent first if you want a different envelope.",
                        });
                    }
                }

                const envelop = await trx
                    .selectFrom("envelops")
                    .select(["id", "space_id"])
                    .where("envelops.id", "=", input.envelopId)
                    .executeTakeFirst();

                if (!envelop || envelop.space_id !== input.spaceId) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Invalid envelop for this space",
                    });
                }

                return trx
                    .insertInto("expense_categories")
                    .values({
                        space_id: input.spaceId,
                        name: input.name,
                        parent_id: input.parentId ?? null,
                        envelop_id: input.envelopId,
                        color: input.color,
                        icon: input.icon,
                    })
                    .returning([
                        "id",
                        "space_id",
                        "parent_id",
                        "envelop_id",
                        "name",
                        "color",
                        "icon",
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
                message: error.message || "Failed to create expense category",
            });
        }

        return result;
    });
