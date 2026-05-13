import type { Kysely, Selectable } from "kysely";
import type { DB, DpsSchemes } from "../../../db/kysely/types.mjs";

type DpsSchemeRow = Selectable<DpsSchemes>;
import {
    buildDpsSchedule,
    computeDpsMaturityDate,
    monthsElapsedSinceStart,
} from "./dpsSchedule.mjs";
import { summarizeDpsProjection } from "./projectDps.mjs";

export type DpsSummary = {
    schemeId: string;
    accountId: string;
    accountName: string;
    bankName: string;
    schemeName: string | null;
    accountNumber: string | null;
    installmentAmount: number;
    termMonths: number;
    annualRateBps: number;
    compounding: "monthly" | "quarterly";
    withholdingTaxBps: number;
    startDate: string;
    installmentDay: number;
    maturityDate: string;
    sourceAccountId: string | null;
    status: "active" | "matured" | "encashed_early" | "abandoned";
    maturedAt: string | null;
    closedAt: string | null;
    finalPayoutAmount: number | null;
    earlyEncashmentRateBps: number | null;
    notes: string | null;
    currentPrincipal: number;
    projectedInterestSoFar: number;
    projectedMaturityGross: number;
    projectedMaturityInterest: number;
    projectedWithholdingTax: number;
    projectedMaturityNet: number;
    monthsElapsed: number;
    installmentsPaid: number;
    installmentsExpected: number;
    missedCount: number;
    nextInstallmentDate: string | null;
    progressPct: number;
    monthlyCommitment: number;
};

/**
 * Build the rich summary view for one DPS scheme. Performs three DB
 * reads: the locked account name, the current account balance, and a
 * count of tagged installment transactions. Everything else is pure
 * derivation from the contract.
 */
export const buildDpsSummary = async ({
    trx,
    scheme,
    now,
}: {
    trx: Kysely<DB>;
    scheme: DpsSchemeRow;
    now: Date;
}): Promise<DpsSummary> => {
    const [accountRow, balanceRow, paidRow, missedRow] = await Promise.all([
        trx
            .selectFrom("accounts")
            .select(["id", "name"])
            .where("id", "=", scheme.account_id)
            .executeTakeFirst(),
        trx
            .selectFrom("account_balances")
            .select("balance")
            .where("account_id", "=", scheme.account_id)
            .executeTakeFirst(),
        trx
            .selectFrom("transactions")
            .select((eb) => eb.fn.count<number>("id").as("count"))
            .where("dps_scheme_id", "=", scheme.id)
            .where("destination_account_id", "=", scheme.account_id)
            .where("type", "=", "transfer" as never)
            .executeTakeFirstOrThrow(),
        trx
            .selectFrom("dps_payouts")
            .select((eb) => eb.fn.count<number>("id").as("count"))
            .where("dps_scheme_id", "=", scheme.id)
            .where("kind", "=", "missed_installment")
            .executeTakeFirstOrThrow(),
    ]);

    const installmentAmount = Number(scheme.installment_amount);
    const termMonths = Number(scheme.term_months);
    const annualRateBps = Number(scheme.annual_rate_bps);
    const compounding =
        scheme.compounding === "monthly" ? "monthly" : "quarterly";
    const withholdingTaxBps = Number(scheme.withholding_tax_bps);
    const startDate = new Date(scheme.start_date as unknown as string);
    const installmentDay = Number(scheme.installment_day);

    const maturityDate = computeDpsMaturityDate({
        startDate,
        installmentDay,
        termMonths,
    });

    const status =
        scheme.status as DpsSummary["status"];

    const effectiveAsOf =
        status === "matured" || status === "encashed_early" || status === "abandoned"
            ? scheme.closed_at ?? scheme.matured_at ?? now
            : now;

    const monthsElapsed = monthsElapsedSinceStart({
        startDate,
        asOf: effectiveAsOf instanceof Date ? effectiveAsOf : new Date(effectiveAsOf),
        termMonths,
    });

    const projection = summarizeDpsProjection(
        {
            installmentAmount,
            termMonths,
            annualRateBps,
            compounding,
            withholdingTaxBps,
        },
        monthsElapsed
    );

    const schedule = buildDpsSchedule({ startDate, installmentDay, termMonths });
    const nextRow = schedule.find((row) => row.date.getTime() > now.getTime());

    const installmentsPaid = Number(paidRow.count);
    const missedCount = Number(missedRow.count);

    const progressPct =
        termMonths === 0 ? 0 : Math.min(100, (monthsElapsed / termMonths) * 100);

    return {
        schemeId: scheme.id,
        accountId: scheme.account_id,
        accountName: accountRow?.name ?? "DPS",
        bankName: scheme.bank_name,
        schemeName: scheme.scheme_name,
        accountNumber: scheme.account_number,
        installmentAmount,
        termMonths,
        annualRateBps,
        compounding,
        withholdingTaxBps,
        startDate: toIsoDate(startDate),
        installmentDay,
        maturityDate: toIsoDate(maturityDate),
        sourceAccountId: scheme.source_account_id,
        status,
        maturedAt: scheme.matured_at ? new Date(scheme.matured_at).toISOString() : null,
        closedAt: scheme.closed_at ? new Date(scheme.closed_at).toISOString() : null,
        finalPayoutAmount:
            scheme.final_payout_amount === null
                ? null
                : Number(scheme.final_payout_amount),
        earlyEncashmentRateBps: scheme.early_encashment_rate_bps,
        notes: scheme.notes,
        currentPrincipal: balanceRow ? Number(balanceRow.balance) : 0,
        projectedInterestSoFar: projection.interestSoFar,
        projectedMaturityGross: projection.projectedMaturityGross,
        projectedMaturityInterest: projection.projectedMaturityInterest,
        projectedWithholdingTax: projection.projectedWithholdingTax,
        projectedMaturityNet: projection.projectedMaturityNet,
        monthsElapsed,
        installmentsPaid,
        installmentsExpected: monthsElapsed,
        missedCount,
        nextInstallmentDate: nextRow ? nextRow.date.toISOString() : null,
        progressPct,
        monthlyCommitment: installmentAmount,
    };
};

const toIsoDate = (d: Date): string => {
    // YYYY-MM-DD in UTC, suitable for `date` columns + display.
    return d.toISOString().slice(0, 10);
};
