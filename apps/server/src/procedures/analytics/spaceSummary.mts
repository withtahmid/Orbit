import { TRPCError } from "@trpc/server";
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

                // Break down balances by account type so we can distinguish
                // "net worth" (assets − liabilities, any type) from
                // "spendable" (net worth minus locked — what's actually
                // available to allocate or spend).
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
                        // Net worth across all account types
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
                        // Spendable: asset + (-liability), ignoring locked
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
                        // Money parked in locked accounts
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

                const envelopeRow = await trx
                    .selectFrom("envelop_balances")
                    .innerJoin("envelops", "envelops.id", "envelop_balances.envelop_id")
                    .where("envelops.space_id", "=", input.spaceId)
                    .select((eb) => [
                        eb.fn.sum<string>("envelop_balances.allocated").as("allocated"),
                        eb.fn.sum<string>("envelop_balances.consumed").as("consumed"),
                        eb.fn.sum<string>("envelop_balances.remaining").as("remaining"),
                    ])
                    .executeTakeFirst();

                const planRow = await trx
                    .selectFrom("plan_balances")
                    .innerJoin("plans", "plans.id", "plan_balances.plan_id")
                    .where("plans.space_id", "=", input.spaceId)
                    .select((eb) => [
                        eb.fn.sum<string>("plan_balances.allocated").as("allocated"),
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

                // Unallocated is signed — negative means over-allocation.
                // Envelopes hold money until consumed, so "held" uses remaining.
                // Locked accounts are excluded from the spendable pool.
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
