import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Transactions } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveMemberSpaceIds, resolveOwnedAccountIds } from "./shared.mjs";

/**
 * Top expense categories the caller has spent on across every space,
 * limited to expenses paid out of accounts the caller owns. The same
 * category name can legitimately appear twice — categories are
 * space-scoped, so this procedure returns `(categoryId, spaceName)` pairs
 * and leaves disambiguation to the UI rather than collapsing them by
 * name (which would silently merge unrelated buckets).
 */
export const personalTopCategories = authorizedProcedure
    .input(
        z.object({
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            limit: z.number().int().min(1).max(50).default(5),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            (async () => {
                const owned = await resolveOwnedAccountIds(
                    ctx.services.qb,
                    ctx.auth.user.id
                );
                const memberSpaces = await resolveMemberSpaceIds(
                    ctx.services.qb,
                    ctx.auth.user.id
                );
                if (owned.length === 0 || memberSpaces.length === 0) return [];

                const rows = await ctx.services.qb
                    .selectFrom("transactions")
                    .innerJoin(
                        "expense_categories",
                        "expense_categories.id",
                        "transactions.expense_category_id"
                    )
                    .innerJoin("spaces", "spaces.id", "transactions.space_id")
                    .where(
                        "transactions.type",
                        "=",
                        "expense" as unknown as Transactions["type"]
                    )
                    .where("transactions.space_id", "in", memberSpaces)
                    .where("transactions.source_account_id", "in", owned)
                    .where("transactions.transaction_datetime", ">=", input.periodStart)
                    .where("transactions.transaction_datetime", "<", input.periodEnd)
                    .groupBy([
                        "expense_categories.id",
                        "expense_categories.name",
                        "expense_categories.color",
                        "expense_categories.icon",
                        "spaces.id",
                        "spaces.name",
                    ])
                    .select((eb) => [
                        eb.ref("expense_categories.id").as("id"),
                        eb.ref("expense_categories.name").as("name"),
                        eb.ref("expense_categories.color").as("color"),
                        eb.ref("expense_categories.icon").as("icon"),
                        eb.ref("spaces.id").as("space_id"),
                        eb.ref("spaces.name").as("space_name"),
                        eb.fn.sum<string>("transactions.amount").as("total"),
                    ])
                    .orderBy("total", "desc")
                    .limit(input.limit)
                    .execute();

                return rows.map((r) => ({
                    id: r.id,
                    name: r.name,
                    color: r.color,
                    icon: r.icon,
                    spaceId: r.space_id,
                    spaceName: r.space_name,
                    total: Number(r.total),
                }));
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute personal top categories",
            });
        }
        return result;
    });
