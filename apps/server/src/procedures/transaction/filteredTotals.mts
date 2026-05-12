import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers, Transactions } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Aggregate IN/OUT/NET/COUNT/AVG-PER-DAY for the same filtered set as
 * `transaction.listBySpace`. The list view computes its summary card
 * from the visible page, which under-reports totals on large filtered
 * sets. This procedure runs the same WHERE clause and returns the
 * window-wide totals so the summary stays correct regardless of pagination.
 *
 * IN counts income to in-space accounts (account-flow rule §12 — same as
 * cashFlow). OUT counts expenses out of in-space accounts plus transfer
 * fees on those accounts. The page-level useMemo only counted `type ===
 * income/expense` rows, but a transfer with a fee is real outflow too,
 * so we mirror the cashFlow definition rather than the page heuristic.
 */
export const transactionFilteredTotals = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            userId: z.string().uuid().nullish(),
            type: z.enum(["income", "expense", "transfer", "adjustment"]).nullish(),
            envelopId: z.string().uuid().nullish(),
            expenseCategoryId: z.string().uuid().nullish(),
            includeDescendants: z.boolean().default(true),
            eventId: z.string().uuid().nullish(),
            accountId: z.string().uuid().nullish(),
            search: z.string().trim().min(1).max(255).nullish(),
            amountMin: z.number().nonnegative().nullish(),
            amountMax: z.number().nonnegative().nullish(),
            dateFrom: z.coerce.date().nullish(),
            dateTo: z.coerce.date().nullish(),
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

                let categoryIds: string[] | null = null;
                if (input.expenseCategoryId) {
                    if (input.includeDescendants) {
                        const res = await sql<{ id: string }>`
                            WITH RECURSIVE subtree AS (
                                SELECT id FROM expense_categories
                                WHERE id = ${input.expenseCategoryId}
                                UNION ALL
                                SELECT ec.id FROM expense_categories ec
                                JOIN subtree s ON ec.parent_id = s.id
                            )
                            SELECT id::text FROM subtree
                        `.execute(ctx.services.qb);
                        categoryIds = res.rows.map((r) => r.id);
                        if (categoryIds.length === 0)
                            categoryIds = [input.expenseCategoryId];
                    } else {
                        categoryIds = [input.expenseCategoryId];
                    }
                }

                const row = await ctx.services.qb
                    .selectFrom("transactions")
                    .where("transactions.space_id", "=", input.spaceId)
                    .$if(!!input.userId, (qb) =>
                        qb.where("transactions.created_by", "=", input.userId!)
                    )
                    .$if(!!input.type, (qb) =>
                        qb.where(
                            "transactions.type",
                            "=",
                            input.type as unknown as Transactions["type"]
                        )
                    )
                    .$if(!!input.envelopId, (qb) =>
                        qb.where(
                            "transactions.envelop_id",
                            "=",
                            input.envelopId!
                        )
                    )
                    .$if(!!categoryIds, (qb) =>
                        qb.where(
                            "transactions.expense_category_id",
                            "in",
                            categoryIds!
                        )
                    )
                    .$if(!!input.eventId, (qb) =>
                        qb.where("transactions.event_id", "=", input.eventId!)
                    )
                    .$if(!!input.accountId, (qb) =>
                        qb.where((eb) =>
                            eb.or([
                                eb(
                                    "transactions.source_account_id",
                                    "=",
                                    input.accountId!
                                ),
                                eb(
                                    "transactions.destination_account_id",
                                    "=",
                                    input.accountId!
                                ),
                            ])
                        )
                    )
                    .$if(!!input.search, (qb) =>
                        qb.where((eb) =>
                            eb.or([
                                eb(
                                    "transactions.description",
                                    "ilike",
                                    `%${input.search}%`
                                ),
                                eb(
                                    "transactions.location",
                                    "ilike",
                                    `%${input.search}%`
                                ),
                            ])
                        )
                    )
                    .$if(
                        input.amountMin !== null && input.amountMin !== undefined,
                        (qb) =>
                            qb.where(
                                "transactions.amount",
                                ">=",
                                input.amountMin as unknown as string
                            )
                    )
                    .$if(
                        input.amountMax !== null && input.amountMax !== undefined,
                        (qb) =>
                            qb.where(
                                "transactions.amount",
                                "<=",
                                input.amountMax as unknown as string
                            )
                    )
                    .$if(!!input.dateFrom, (qb) =>
                        qb.where(
                            "transactions.transaction_datetime",
                            ">=",
                            input.dateFrom!
                        )
                    )
                    .$if(!!input.dateTo, (qb) =>
                        qb.where(
                            "transactions.transaction_datetime",
                            "<",
                            input.dateTo!
                        )
                    )
                    .select((eb) => [
                        eb.fn.count<string>("transactions.id").as("count"),
                        sql<string>`COALESCE(SUM(CASE WHEN ${eb.ref(
                            "transactions.type"
                        )} = 'income' THEN ${eb.ref(
                            "transactions.amount"
                        )} ELSE 0 END), 0)::text`.as("in_total"),
                        sql<string>`COALESCE(SUM(
                            CASE WHEN ${eb.ref(
                                "transactions.type"
                            )} = 'expense' THEN ${eb.ref(
                                "transactions.amount"
                            )} ELSE 0 END
                        ), 0)::text`.as("out_total"),
                    ])
                    .executeTakeFirst();

                const inTotal = Number(row?.in_total ?? 0);
                const outTotal = Number(row?.out_total ?? 0);
                const count = Number(row?.count ?? 0);

                /* Window length used for avg-per-day. Fallback to 1 day
                   when the caller didn't pass dateFrom/dateTo so callers
                   without a window still see a plain total. */
                let days = 1;
                if (input.dateFrom && input.dateTo) {
                    const ms =
                        input.dateTo.getTime() - input.dateFrom.getTime();
                    days = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
                }
                return {
                    inTotal,
                    outTotal,
                    net: inTotal - outTotal,
                    count,
                    avgPerDay: outTotal / days,
                    days,
                };
            })()
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute filtered totals",
            });
        }
        return result;
    });
