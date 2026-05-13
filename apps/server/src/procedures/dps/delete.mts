import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import type { UserAccounts } from "../../db/kysely/types.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Delete a DPS scheme. Refuses if any tagged transactions exist —
 * those represent real money movements that should not silently lose
 * their context. Use `dps.markAbandoned` instead. Cascades to
 * `dps_payouts` (FK ON DELETE CASCADE). Does not delete the
 * underlying account; that's a separate `account.delete` call.
 */
export const deleteDps = authorizedProcedure
    .input(z.object({ schemeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
        const [error] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const scheme = await trx
                    .selectFrom("dps_schemes")
                    .select(["id", "space_id", "created_by"])
                    .where("id", "=", input.schemeId)
                    .executeTakeFirst();
                if (!scheme) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "DPS scheme not found",
                    });
                }
                if (scheme.created_by !== ctx.auth.user.id) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message:
                            "Only the user who recorded this DPS can delete it",
                    });
                }
                await resolveSpaceMembership({
                    trx,
                    spaceId: scheme.space_id,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as UserAccounts["role"][],
                });

                const txnCount = await trx
                    .selectFrom("transactions")
                    .select((eb) =>
                        eb.fn.count<number>("transactions.id").as("count")
                    )
                    .where("dps_scheme_id", "=", input.schemeId)
                    .executeTakeFirstOrThrow();
                if (Number(txnCount.count) > 0) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: `Cannot delete: ${txnCount.count} transactions are tagged to this DPS. Use "Mark as abandoned" instead, or delete those transactions first.`,
                    });
                }

                await trx
                    .deleteFrom("dps_schemes")
                    .where("id", "=", input.schemeId)
                    .execute();
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to delete DPS scheme",
            });
        }
    });
