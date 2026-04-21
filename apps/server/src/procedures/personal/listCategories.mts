import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds } from "./shared.mjs";

/**
 * Every expense category across the caller's member spaces, flat list
 * with `space_id` included on each row. Same column set as
 * expenseCategory.listBySpace so the virtual-space TransactionsPage
 * can render its category filter unchanged. Categories are
 * space-scoped — parent_id relationships only make sense within one
 * space — so consumers that build tree views should group by
 * space_id first.
 */
export const personalListCategories = authorizedProcedure.query(async ({ ctx }) => {
    const [error, rows] = await safeAwait(
        (async () => {
            const memberSpaces = await resolveMemberSpaceIds(
                ctx.services.qb,
                ctx.auth.user.id
            );
            if (memberSpaces.length === 0) return [];
            return ctx.services.qb
                .selectFrom("expense_categories")
                .select([
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
                .where("space_id", "in", memberSpaces)
                .orderBy("space_id", "asc")
                .orderBy("created_at", "asc")
                .execute();
        })()
    );
    if (error) {
        throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message || "Failed to list personal categories",
        });
    }
    return rows ?? [];
});
