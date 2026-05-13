import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import type { UserAccounts } from "../../db/kysely/types.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

export const undoDpsMissed = authorizedProcedure
    .input(
        z.object({
            schemeId: z.string().uuid(),
            installmentDate: z.coerce.date(),
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

                const yyyymm = input.installmentDate.toISOString().slice(0, 7);
                await trx
                    .deleteFrom("dps_payouts")
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
                    .execute();
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to undo missed installment",
            });
        }
    });
