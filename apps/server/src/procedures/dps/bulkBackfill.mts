import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { withIdempotency } from "../../utils/withIdempotency.mjs";
import { postDpsInstallment } from "./utils/postDpsInstallment.mjs";
import { buildDpsSchedule } from "./utils/dpsSchedule.mjs";

/**
 * Backfill every expected installment from `start_date` through
 * `throughDate` that isn't already recorded as either a tagged
 * transfer or a `missed_installment` payout row. Used when a user
 * imports an existing DPS into Orbit that's been running for months
 * or years.
 *
 * When `bypassAvailableBalanceCheck` is true (the default for this
 * procedure — Orbit doesn't have a historical balance ledger to gate
 * on), the source account is debited without checking present-day
 * availability. The user is explicitly opting in via UI.
 */
export const bulkBackfillDps = authorizedProcedure
    .input(
        z.object({
            schemeId: z.string().uuid(),
            throughDate: z.coerce.date(),
            sourceAccountId: z.string().uuid().optional(),
            bypassAvailableBalanceCheck: z.boolean().default(true),
            idempotencyKey: z.string().uuid().optional(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) =>
                withIdempotency({
                    trx,
                    userId: ctx.auth.user.id,
                    operation: "dps.bulkBackfill",
                    key: input.idempotencyKey,
                    fn: async () => {
                        const scheme = await trx
                            .selectFrom("dps_schemes")
                            .selectAll()
                            .where("id", "=", input.schemeId)
                            .executeTakeFirst();
                        if (!scheme) {
                            throw new TRPCError({
                                code: "NOT_FOUND",
                                message: "DPS scheme not found",
                            });
                        }
                        const source =
                            input.sourceAccountId ?? scheme.source_account_id;
                        if (!source) {
                            throw new TRPCError({
                                code: "BAD_REQUEST",
                                message:
                                    "No source account: pick one, or set the scheme's linked savings account first",
                            });
                        }

                        const startDate = new Date(
                            scheme.start_date as unknown as string
                        );
                        const schedule = buildDpsSchedule({
                            startDate,
                            installmentDay: Number(scheme.installment_day),
                            termMonths: Number(scheme.term_months),
                        });
                        const through = input.throughDate.getTime();
                        const due = schedule.filter(
                            (r) => r.date.getTime() <= through
                        );

                        // Already-covered dates: tagged transfers OR
                        // missed-installment rows, matched by year-month.
                        const existingTransfers = await trx
                            .selectFrom("transactions")
                            .select("transaction_datetime")
                            .where("dps_scheme_id", "=", scheme.id)
                            .where(
                                "destination_account_id",
                                "=",
                                scheme.account_id
                            )
                            .where("type", "=", "transfer" as never)
                            .execute();
                        const existingMissed = await trx
                            .selectFrom("dps_payouts")
                            .select("occurred_at")
                            .where("dps_scheme_id", "=", scheme.id)
                            .where("kind", "=", "missed_installment")
                            .execute();

                        const covered = new Set<string>();
                        for (const r of existingTransfers) {
                            covered.add(
                                new Date(r.transaction_datetime)
                                    .toISOString()
                                    .slice(0, 7)
                            );
                        }
                        for (const r of existingMissed) {
                            covered.add(
                                new Date(r.occurred_at).toISOString().slice(0, 7)
                            );
                        }

                        const toPost = due.filter(
                            (r) => !covered.has(r.date.toISOString().slice(0, 7))
                        );

                        const postedIds: string[] = [];
                        for (const row of toPost) {
                            const id = await postDpsInstallment({
                                trx,
                                scheme,
                                userId: ctx.auth.user.id,
                                sourceAccountId: source,
                                occurredAt: row.date,
                                description: `DPS installment ${row.index}/${scheme.term_months} — ${scheme.bank_name}`,
                                bypassAvailableBalance:
                                    input.bypassAvailableBalanceCheck,
                            });
                            postedIds.push(id);
                        }

                        return {
                            postedCount: postedIds.length,
                            transactionIds: postedIds,
                        };
                    },
                })
            )
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to backfill DPS installments",
            });
        }
        return result;
    });
