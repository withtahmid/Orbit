import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";
import type { SpaceMembers, Transactions } from "../../db/kysely/types.mjs";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const spaceSummary = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            periodStart: z.coerce.date(),
            periodEnd: z.coerce.date(),
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

                const balanceRow = await trx
                    .selectFrom("account_balances")
                    .innerJoin(
                        "space_accounts",
                        "space_accounts.account_id",
                        "account_balances.account_id"
                    )
                    .innerJoin("accounts", "accounts.id", "space_accounts.account_id")
                    .where("space_accounts.space_id", "=", input.spaceId)
                    .select((eb) => [
                        eb.fn
                            .sum<string>(
                                eb
                                    .case()
                                    .when("accounts.account_type", "=", "liability" as any)
                                    .then(eb.neg("account_balances.balance"))
                                    .else(eb.ref("account_balances.balance"))
                                    .end()
                            )
                            .as("total_balance"),
                        eb.fn
                            .sum<string>(
                                eb
                                    .case()
                                    .when("accounts.account_type", "=", "liability" as any)
                                    .then(eb.neg("account_balances.balance"))
                                    .when("accounts.account_type", "=", "locked" as any)
                                    .then(0)
                                    .else(eb.ref("account_balances.balance"))
                                    .end()
                            )
                            .as("spendable_balance"),
                        eb.fn
                            .sum<string>(
                                eb
                                    .case()
                                    .when("accounts.account_type", "=", "locked" as any)
                                    .then(eb.ref("account_balances.balance"))
                                    .else(0)
                                    .end()
                            )
                            .as("locked_balance"),
                    ])
                    .executeTakeFirst();

                // On-read envelope aggregates (lifetime allocated + consumed
                // + current-period-remaining-clamped via a CTE).
                const envelopeRow = await sql<{
                    allocated: string;
                    consumed: string;
                    remaining: string;
                }>`
                    WITH period AS (
                        SELECT
                            e.id AS envelop_id,
                            e.cadence,
                            CASE e.cadence
                                WHEN 'none' THEN DATE '1970-01-01'
                                WHEN 'monthly' THEN DATE_TRUNC('month', NOW())::date
                            END AS p_start,
                            CASE e.cadence
                                WHEN 'none' THEN DATE '9999-12-31'
                                WHEN 'monthly' THEN (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::date
                            END AS p_end
                        FROM envelops e
                        WHERE e.space_id = ${input.spaceId}
                    ),
                    per_env AS (
                        SELECT
                            p.envelop_id,
                            COALESCE((
                                SELECT SUM(a.amount)
                                FROM envelop_allocations a
                                WHERE a.envelop_id = p.envelop_id
                                  AND (
                                      p.cadence = 'none'
                                      OR (
                                          COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) >= p.p_start
                                          AND COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) < p.p_end
                                      )
                                  )
                            ), 0) AS p_allocated,
                            COALESCE((
                                SELECT SUM(t.amount)
                                FROM transactions t
                                JOIN expense_categories ec ON ec.id = t.expense_category_id
                                WHERE ec.envelop_id = p.envelop_id
                                  AND t.type = 'expense'
                                  AND t.transaction_datetime >= p.p_start
                                  AND t.transaction_datetime < p.p_end
                            ), 0) AS p_consumed
                        FROM period p
                    )
                    SELECT
                        COALESCE(SUM(p_allocated), 0)::text AS allocated,
                        COALESCE(SUM(p_consumed), 0)::text AS consumed,
                        COALESCE(SUM(GREATEST(0, p_allocated - p_consumed)), 0)::text AS remaining
                    FROM per_env
                `
                    .execute(trx)
                    .then((r) => r.rows[0]);

                const planRow = await trx
                    .selectFrom("plan_allocations")
                    .innerJoin("plans", "plans.id", "plan_allocations.plan_id")
                    .where("plans.space_id", "=", input.spaceId)
                    .select((eb) => [
                        eb.fn.sum<string>("plan_allocations.amount").as("allocated"),
                    ])
                    .executeTakeFirst();

                const incomeExpenseRow = await trx
                    .selectFrom("transactions")
                    .where("space_id", "=", input.spaceId)
                    .where("transaction_datetime", ">=", input.periodStart)
                    .where("transaction_datetime", "<", input.periodEnd)
                    .select((eb) => [
                        eb.fn
                            .sum<string>(
                                eb
                                    .case()
                                    .when(
                                        "type",
                                        "=",
                                        "income" as unknown as Transactions["type"]
                                    )
                                    .then(eb.ref("amount"))
                                    .else(0)
                                    .end()
                            )
                            .as("income"),
                        eb.fn
                            .sum<string>(
                                eb
                                    .case()
                                    .when(
                                        "type",
                                        "=",
                                        "expense" as unknown as Transactions["type"]
                                    )
                                    .then(eb.ref("amount"))
                                    .else(0)
                                    .end()
                            )
                            .as("expense"),
                    ])
                    .executeTakeFirst();

                const totalBalance = Number(balanceRow?.total_balance ?? 0);
                const spendableBalance = Number(balanceRow?.spendable_balance ?? 0);
                const lockedBalance = Number(balanceRow?.locked_balance ?? 0);
                const envelopeAllocated = Number(envelopeRow?.allocated ?? 0);
                const envelopeConsumed = Number(envelopeRow?.consumed ?? 0);
                const envelopeRemaining = Number(envelopeRow?.remaining ?? 0);
                const planAllocated = Number(planRow?.allocated ?? 0);
                const income = Number(incomeExpenseRow?.income ?? 0);
                const expense = Number(incomeExpenseRow?.expense ?? 0);

                const unallocated = spendableBalance - envelopeRemaining - planAllocated;

                return {
                    totalBalance,
                    spendableBalance,
                    lockedBalance,
                    envelopeAllocated,
                    envelopeConsumed,
                    envelopeRemaining,
                    planAllocated,
                    unallocated,
                    isOverAllocated: unallocated < 0,
                    periodIncome: income,
                    periodExpense: expense,
                    periodNet: income - expense,
                };
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to compute space summary",
            });
        }
        return result;
    });
