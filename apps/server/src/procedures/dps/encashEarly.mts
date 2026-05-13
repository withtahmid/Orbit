import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { withIdempotency } from "../../utils/withIdempotency.mjs";
import { closeDpsScheme } from "./utils/closeDpsScheme.mjs";

export const encashDpsEarly = authorizedProcedure
    .input(
        z.object({
            schemeId: z.string().uuid(),
            encashmentDate: z.coerce.date(),
            payoutAmount: z.number().positive(),
            payoutAccountId: z.string().uuid(),
            earlyRateBps: z.number().int().min(0).max(5000).optional(),
            note: z.string().max(2000).optional(),
            idempotencyKey: z.string().uuid().optional(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) =>
                withIdempotency({
                    trx,
                    userId: ctx.auth.user.id,
                    operation: "dps.encashEarly",
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
                            kind: "encashed_early",
                            occurredAt: input.encashmentDate,
                            payoutAmount: input.payoutAmount,
                            payoutAccountId: input.payoutAccountId,
                            earlyEncashmentRateBps: input.earlyRateBps ?? null,
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
                message: error.message || "Failed to encash DPS scheme",
            });
        }
        return result;
    });
