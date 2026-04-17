import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SpaceMembers, Transactions } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const topCategories = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
            limit: z.number().int().min(1).max(50).default(5),
        })
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                await resolveSpaceMembership({
                    trx,
                    spaceId: input.spaceId,
                    userId: ctx.auth.user.id,
                    roles: ["owner", "editor", "viewer"] as unknown as SpaceMembers["role"][],
                });

                const rows = await trx
                    .selectFrom("transactions")
                    .innerJoin(
                        "expense_categories",
                        "expense_categories.id",
                        "transactions.expense_category_id"
                    )
                    .where(
                        "transactions.type",
                        "=",
                        "expense" as unknown as Transactions["type"]
                    )
                    .where("transactions.space_id", "=", input.spaceId)
                    .where("transactions.transaction_datetime", ">=", input.periodStart)
                    .where("transactions.transaction_datetime", "<", input.periodEnd)
                    .groupBy([
                        "expense_categories.id",
                        "expense_categories.name",
                        "expense_categories.color",
                        "expense_categories.icon",
                    ])
                    .select((eb) => [
                        eb.ref("expense_categories.id").as("id"),
                        eb.ref("expense_categories.name").as("name"),
                        eb.ref("expense_categories.color").as("color"),
                        eb.ref("expense_categories.icon").as("icon"),
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
                    total: Number(r.total),
                }));
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute top categories",
            });
        }
        return result;
    });
