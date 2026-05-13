import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { withIdempotency } from "../../utils/withIdempotency.mjs";
import { postDpsInstallment } from "./utils/postDpsInstallment.mjs";

/**
 * Convenience wrapper: record one DPS installment without making the
 * user fish through the generic transaction form. Pulls the source
 * account from the scheme contract by default; caller may override
 * (e.g. they paid from a different account this month).
 */
export const markDpsPaid = authorizedProcedure
    .input(
        z.object({
            schemeId: z.string().uuid(),
            installmentDate: z.coerce.date(),
            sourceAccountId: z.string().uuid().optional(),
            description: z.string().max(255).optional(),
            idempotencyKey: z.string().uuid().optional(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) =>
                withIdempotency({
                    trx,
                    userId: ctx.auth.user.id,
                    operation: "dps.markPaid",
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
                        const txnId = await postDpsInstallment({
                            trx,
                            scheme,
                            userId: ctx.auth.user.id,
                            sourceAccountId: source,
                            occurredAt: input.installmentDate,
                            description: input.description ?? null,
                            bypassAvailableBalance: false,
                        });
                        return { transactionId: txnId };
                    },
                })
            )
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to record DPS installment",
            });
        }
        return result;
    });
