import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import type { UserAccounts } from "../../db/kysely/types.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Record that a particular installment was missed (the bank either
 * couldn't auto-debit, or the user skipped). Idempotent on
 * (schemeId, occurredAt month) — a second call for the same month
 * collapses to a no-op.
 */
export const markDpsMissed = authorizedProcedure
    .input(
        z.object({
            schemeId: z.string().uuid(),
            installmentDate: z.coerce.date(),
            note: z.string().max(2000).optional(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const scheme = await trx
                    .selectFrom("dps_schemes")
                    .select(["id", "space_id"])
                    .where("id", "=", input.schemeId)
                    .executeTakeFirst();
                if (!scheme) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "DPS scheme not found",
                    });
                }
                await resolveSpaceMembership({
                    trx,
                    spaceId: scheme.space_id,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as UserAccounts["role"][],
                });

                // Deduplicate by year-month.
                const yyyymm = input.installmentDate.toISOString().slice(0, 7);
                const existing = await trx
                    .selectFrom("dps_payouts")
                    .select("id")
                    .where("dps_scheme_id", "=", scheme.id)
                    .where("kind", "=", "missed_installment")
                    .where(
                        (eb) =>
                            eb.fn<string>("to_char", [
                                eb.ref("occurred_at"),
                                eb.val("YYYY-MM"),
                            ]),
                        "=",
                        yyyymm
                    )
                    .executeTakeFirst();
                if (existing) return;

                await trx
                    .insertInto("dps_payouts")
                    .values({
                        dps_scheme_id: scheme.id,
                        kind: "missed_installment",
                        occurred_at: input.installmentDate,
                        cash_amount: null,
                        linked_transaction_id: null,
                        note: input.note ?? null,
                    })
                    .execute();
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to mark installment as missed",
            });
        }
    });
