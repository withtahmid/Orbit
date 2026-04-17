import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Re-point a category (and its entire subtree) to a different envelope.
 * All descendants must move together to preserve the "children share parent's
 * envelope" invariant enforced in create.
 *
 * Note: this reassigns the category → envelope link for future queries, and
 * because the envelope-balance trigger reads the link live, any NEW
 * transactions routed through these categories hit the new envelope. Historic
 * balances are NOT rewritten — `envelop_balances.consumed` reflects the link
 * at the time each transaction fired the trigger, so a rebuild is needed if
 * the user wants history redirected. Surface that caveat in the UI.
 */
export const changeExpenseCategoryEnvelop = authorizedProcedure
    .input(
        z.object({
            categoryId: z.string().uuid(),
            envelopId: z.string().uuid(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const current = await trx
                    .selectFrom("expense_categories")
                    .select(["id", "space_id", "envelop_id"])
                    .where("expense_categories.id", "=", input.categoryId)
                    .executeTakeFirst();

                if (!current) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Category not found",
                    });
                }

                await resolveSpaceMembership({
                    trx,
                    spaceId: current.space_id,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as SpaceMembers["role"][],
                });

                const envelop = await trx
                    .selectFrom("envelops")
                    .select(["id", "space_id"])
                    .where("envelops.id", "=", input.envelopId)
                    .executeTakeFirst();

                if (!envelop || envelop.space_id !== current.space_id) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Target envelope does not belong to this space",
                    });
                }

                if (current.envelop_id === input.envelopId) {
                    return { movedCount: 0 };
                }

                // Move entire subtree — self + descendants.
                const res = await sql<{ id: string }>`
                    WITH RECURSIVE subtree AS (
                        SELECT id FROM expense_categories WHERE id = ${input.categoryId}
                        UNION ALL
                        SELECT ec.id
                        FROM expense_categories ec
                        JOIN subtree s ON ec.parent_id = s.id
                    )
                    UPDATE expense_categories
                    SET envelop_id = ${input.envelopId}, updated_at = NOW()
                    WHERE id IN (SELECT id FROM subtree)
                    RETURNING id
                `.execute(trx);

                return { movedCount: res.rows.length };
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to change envelope for category",
            });
        }
        return result;
    });
