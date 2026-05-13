import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { withIdempotency } from "../../utils/withIdempotency.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import type { Accounts, UserAccounts } from "../../db/kysely/types.mjs";

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Create a DPS scheme. Materializes three things atomically:
 *
 *   1. A `locked` account that holds the principal balance.
 *   2. The `dps_schemes` contract row.
 *   3. A `dps_payouts` row of `kind='opened'` so the lifecycle ledger
 *      has a single source of truth from day one.
 *
 * The caller must be `owner` of the space. The created account is
 * automatically owned by the caller (this is personal money — joint
 * holders can be added via `account.addMember` later) and shared into
 * the space the scheme was recorded under.
 */
export const createDps = authorizedProcedure
    .input(
        z.object({
            spaceId: z.string().uuid(),
            bankName: z.string().min(1).max(120),
            schemeName: z.string().min(1).max(120).optional(),
            accountNumber: z.string().max(40).optional(),
            installmentAmount: z.number().positive(),
            termMonths: z.number().int().min(1).max(360),
            annualRateBps: z.number().int().min(1).max(5000),
            compounding: z.enum(["monthly", "quarterly"]).default("quarterly"),
            startDate: z.coerce.date(),
            installmentDay: z.number().int().min(1).max(31).optional(),
            sourceAccountId: z.string().uuid().optional(),
            withholdingTaxBps: z.number().int().min(0).max(5000).default(1000),
            color: z.string().regex(HEX).optional(),
            icon: z.string().min(1).max(48).optional(),
            notes: z.string().max(2000).optional(),
            idempotencyKey: z.string().uuid().optional(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) =>
                withIdempotency({
                    trx,
                    userId: ctx.auth.user.id,
                    operation: "dps.create",
                    key: input.idempotencyKey,
                    fn: async () => {
                        await resolveSpaceMembership({
                            trx,
                            spaceId: input.spaceId,
                            userId: ctx.auth.user.id,
                            roles: ["owner"] as unknown as UserAccounts["role"][],
                        });

                        // Resolve the installment day. If the user didn't
                        // pick one, anchor it on the start date's
                        // day-of-month (Asia/Dhaka wall-clock — the
                        // start_date input is a date-only Date).
                        const installmentDay =
                            input.installmentDay ?? input.startDate.getUTCDate();

                        const accountName =
                            input.schemeName?.trim() ||
                            `${input.bankName.trim()} DPS`;

                        const account = await trx
                            .insertInto("accounts")
                            .values({
                                name: accountName,
                                account_type:
                                    "locked" as unknown as Accounts["account_type"],
                                color: input.color,
                                icon: input.icon,
                            })
                            .returning(["id"])
                            .executeTakeFirstOrThrow();

                        await trx
                            .insertInto("user_accounts")
                            .values({
                                account_id: account.id,
                                user_id: ctx.auth.user.id,
                                role: "owner" as unknown as UserAccounts["role"],
                            })
                            .executeTakeFirstOrThrow();

                        await trx
                            .insertInto("space_accounts")
                            .values({
                                account_id: account.id,
                                space_id: input.spaceId,
                            })
                            .executeTakeFirstOrThrow();

                        await trx
                            .insertInto("account_balances")
                            .values({
                                account_id: account.id,
                                balance: 0,
                            })
                            .executeTakeFirstOrThrow();

                        const scheme = await trx
                            .insertInto("dps_schemes")
                            .values({
                                account_id: account.id,
                                created_by: ctx.auth.user.id,
                                space_id: input.spaceId,
                                bank_name: input.bankName.trim(),
                                scheme_name: input.schemeName?.trim() ?? null,
                                account_number:
                                    input.accountNumber?.trim() ?? null,
                                installment_amount: input.installmentAmount,
                                term_months: input.termMonths,
                                annual_rate_bps: input.annualRateBps,
                                compounding: input.compounding,
                                start_date: input.startDate,
                                installment_day: installmentDay,
                                source_account_id:
                                    input.sourceAccountId ?? null,
                                withholding_tax_bps: input.withholdingTaxBps,
                                notes: input.notes ?? null,
                            })
                            .returning(["id"])
                            .executeTakeFirstOrThrow();

                        await trx
                            .insertInto("dps_payouts")
                            .values({
                                dps_scheme_id: scheme.id,
                                kind: "opened",
                                occurred_at: input.startDate,
                                cash_amount: null,
                                linked_transaction_id: null,
                            })
                            .executeTakeFirstOrThrow();

                        return {
                            schemeId: scheme.id,
                            accountId: account.id,
                            accountName,
                        };
                    },
                })
            )
        );

        if (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to create DPS scheme",
            });
        }
        return result;
    });
