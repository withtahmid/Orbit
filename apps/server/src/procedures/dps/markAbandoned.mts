import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { withIdempotency } from "../../utils/withIdempotency.mjs";
import { closeDpsScheme } from "./utils/closeDpsScheme.mjs";

export const markDpsAbandoned = authorizedProcedure
    .input(
        z.object({
            schemeId: z.string().uuid(),
            abandonedAt: z.coerce.date(),
            payoutAmount: z.number().positive().nullable(),
            payoutAccountId: z.string().uuid().nullable(),
            note: z.string().max(2000).optional(),
            idempotencyKey: z.string().uuid().optional(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        if (
            (input.payoutAmount === null) !== (input.payoutAccountId === null)
        ) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                    "Payout amount and payout account must both be provided, or both be null",
            });
        }

        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) =>
                withIdempotency({
                    trx,
                    userId: ctx.auth.user.id,
                    operation: "dps.markAbandoned",
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
                        return await closeDpsScheme({
                            trx,
                            scheme,
                            userId: ctx.auth.user.id,
                            kind: "abandoned",
                            occurredAt: input.abandonedAt,
                            payoutAmount: input.payoutAmount,
                            payoutAccountId: input.payoutAccountId,
                            earlyEncashmentRateBps: null,
                            note: input.note ?? null,
                        });
                    },
                })
            )
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to mark DPS abandoned",
            });
        }
        return result;
    });
