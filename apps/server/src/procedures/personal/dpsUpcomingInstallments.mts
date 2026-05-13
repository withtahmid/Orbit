import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import {
    resolveMemberSpaceIds,
    resolveOwnedAccountIds,
} from "./shared.mjs";
import { buildDpsSchedule } from "../dps/utils/dpsSchedule.mjs";

/**
 * Flattened upcoming-installment list across every personally-owned
 * active DPS. Returns rows due within the next `windowDays` days.
 */
export const personalDpsUpcomingInstallments = authorizedProcedure
    .input(
        z
            .object({ windowDays: z.number().int().min(1).max(120).default(30) })
            .optional()
    )
    .query(async ({ ctx, input }) => {
        const [error, result] = await safeAwait(
            ctx.services.qb.transaction().execute(async (trx) => {
                const [ownedAccountIds, memberSpaceIds] = await Promise.all([
                    resolveOwnedAccountIds(trx, ctx.auth.user.id),
                    resolveMemberSpaceIds(trx, ctx.auth.user.id),
                ]);
                if (
                    ownedAccountIds.length === 0 ||
                    memberSpaceIds.length === 0
                ) {
                    return [];
                }

                const schemes = await trx
                    .selectFrom("dps_schemes")
                    .innerJoin(
                        "accounts",
                        "accounts.id",
                        "dps_schemes.account_id"
                    )
                    .where(
                        "dps_schemes.account_id",
                        "in",
                        ownedAccountIds
                    )
                    .where("dps_schemes.space_id", "in", memberSpaceIds)
                    .where("dps_schemes.status", "=", "active")
                    .select([
                        "dps_schemes.id as scheme_id",
                        "dps_schemes.account_id",
                        "accounts.name as account_name",
                        "dps_schemes.bank_name",
                        "dps_schemes.scheme_name",
                        "dps_schemes.installment_amount",
                        "dps_schemes.term_months",
                        "dps_schemes.installment_day",
                        "dps_schemes.start_date",
                        "dps_schemes.source_account_id",
                    ])
                    .execute();

                const now = Date.now();
                const windowMs =
                    (input?.windowDays ?? 30) * 24 * 3600 * 1000;
                const horizon = now + windowMs;

                const out: {
                    schemeId: string;
                    accountName: string;
                    bankName: string;
                    schemeName: string | null;
                    dueDate: string;
                    amount: number;
                    sourceAccountId: string | null;
                    installmentIndex: number;
                }[] = [];

                for (const s of schemes) {
                    const schedule = buildDpsSchedule({
                        startDate: new Date(s.start_date as unknown as string),
                        installmentDay: Number(s.installment_day),
                        termMonths: Number(s.term_months),
                    });
                    for (const row of schedule) {
                        const t = row.date.getTime();
                        if (t < now) continue;
                        if (t > horizon) break;
                        out.push({
                            schemeId: s.scheme_id,
                            accountName: s.account_name,
                            bankName: s.bank_name,
                            schemeName: s.scheme_name,
                            dueDate: row.date.toISOString(),
                            amount: Number(s.installment_amount),
                            sourceAccountId: s.source_account_id,
                            installmentIndex: row.index,
                        });
                    }
                }

                out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
                return out;
            })
        );
        if (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message:
                    error.message || "Failed to list upcoming DPS installments",
            });
        }
        return result;
    });
