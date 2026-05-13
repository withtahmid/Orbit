import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import type { UserAccounts } from "../../db/kysely/types.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";

/**
 * Update non-contract metadata on a DPS scheme. Contract terms
 * (installment amount, term, rate, compounding, start date,
 * installment day) are immutable after any tagged transaction or
 * lifecycle event other than `opened` exists — changing them silently
 * invalidates every projection ever shown. Force delete-and-recreate
 * if the user wants to fix a setup error.
 */
export const updateDps = authorizedProcedure
    .input(
        z.object({
            schemeId: z.string().uuid(),
            bankName: z.string().min(1).max(120).optional(),
            schemeName: z.string().min(1).max(120).nullable().optional(),
            accountNumber: z.string().max(40).nullable().optional(),
            sourceAccountId: z.string().uuid().nullable().optional(),
            withholdingTaxBps: z.number().int().min(0).max(5000).optional(),
            notes: z.string().max(2000).nullable().optional(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const [error] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
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
                await resolveSpaceMembership({
                    trx,
                    spaceId: scheme.space_id,
                    userId: ctx.auth.user.id,
                    roles: ["owner"] as unknown as UserAccounts["role"][],
                });

                const patch: Record<string, unknown> = {};
                if (input.bankName !== undefined) patch.bank_name = input.bankName.trim();
                if (input.schemeName !== undefined)
                    patch.scheme_name = input.schemeName?.trim() ?? null;
                if (input.accountNumber !== undefined)
                    patch.account_number = input.accountNumber?.trim() ?? null;
                if (input.sourceAccountId !== undefined)
                    patch.source_account_id = input.sourceAccountId ?? null;
                if (input.withholdingTaxBps !== undefined)
                    patch.withholding_tax_bps = input.withholdingTaxBps;
                if (input.notes !== undefined) patch.notes = input.notes ?? null;

                if (Object.keys(patch).length === 0) {
                    return;
                }
                patch.updated_at = new Date();

                await trx
                    .updateTable("dps_schemes")
                    .set(patch)
                    .where("id", "=", input.schemeId)
                    .execute();
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error.message || "Failed to update DPS scheme",
            });
        }
    });
