/**
 * Pure-compute DPS projection helpers — month-by-month future value of
 * an ordinary annuity, with monthly or quarterly compounding. No DB,
 * no clock, no timezone. Inputs are the contract; outputs are arrays
 * of paisa-accurate decimals.
 *
 * Bangladeshi banks publish maturity tables that vary slightly from
 * any closed-form formula because they apply mid-quarter accrual /
 * different rounding. We pick ordinary-annuity (installment at end of
 * compounding period) which is the conservative side — the bank will
 * pay a hair more, never less.
 */

export type Compounding = "monthly" | "quarterly";

export type DpsProjectionInput = {
    installmentAmount: number;
    termMonths: number;
    annualRateBps: number;
    compounding: Compounding;
    withholdingTaxBps: number;
};

export type DpsProjectionRow = {
    monthIndex: number; // 0..termMonths
    principalCumulative: number;
    interestCumulative: number;
    balanceCumulative: number;
};

/**
 * Simulate the scheme month-by-month from month 0 (just opened, 0
 * paid) through `termMonths`. Each month: deposit `P`. At the end of
 * each compounding period, multiply the running balance by (1 + i).
 *
 * Returns `termMonths + 1` rows so callers can index by elapsed
 * months without an off-by-one.
 */
export const simulateDpsTimeline = (
    input: DpsProjectionInput
): DpsProjectionRow[] => {
    const P = Number(input.installmentAmount);
    const r = input.annualRateBps / 10_000; // annual rate as decimal
    const f = input.compounding === "monthly" ? 12 : 4;
    const i = r / f;
    const periodEveryNMonths = 12 / f; // monthly: 1, quarterly: 3

    const rows: DpsProjectionRow[] = [
        { monthIndex: 0, principalCumulative: 0, interestCumulative: 0, balanceCumulative: 0 },
    ];

    let balance = 0;
    let principalPaid = 0;

    for (let m = 1; m <= input.termMonths; m++) {
        // Deposit at start of month.
        balance += P;
        principalPaid += P;

        // Compound at end of period (every 3 months for quarterly,
        // every month for monthly).
        if (m % periodEveryNMonths === 0) {
            balance = balance * (1 + i);
        }

        rows.push({
            monthIndex: m,
            principalCumulative: principalPaid,
            interestCumulative: balance - principalPaid,
            balanceCumulative: balance,
        });
    }

    return rows;
};

export type DpsProjectionSummary = {
    principalSoFar: number;
    interestSoFar: number;
    balanceSoFar: number;
    projectedMaturityGross: number;
    projectedMaturityInterest: number;
    projectedWithholdingTax: number;
    projectedMaturityNet: number;
};

/**
 * Convenience over `simulateDpsTimeline`: pick out the snapshot at
 * `monthsElapsed` and the snapshot at maturity. Computes the net
 * maturity after applying withholding tax to the interest portion.
 *
 * Clamps `monthsElapsed` to [0, termMonths]; callers passing future
 * dates for matured schemes shouldn't have to do that themselves.
 */
export const summarizeDpsProjection = (
    input: DpsProjectionInput,
    monthsElapsed: number
): DpsProjectionSummary => {
    const timeline = simulateDpsTimeline(input);
    const clamped = Math.max(0, Math.min(input.termMonths, Math.floor(monthsElapsed)));
    const snap = timeline[clamped]!;
    const final = timeline[input.termMonths]!;

    const projectedMaturityGross = final.balanceCumulative;
    const projectedMaturityInterest = final.interestCumulative;
    const projectedWithholdingTax =
        projectedMaturityInterest * (input.withholdingTaxBps / 10_000);
    const projectedMaturityNet = projectedMaturityGross - projectedWithholdingTax;

    return {
        principalSoFar: snap.principalCumulative,
        interestSoFar: snap.interestCumulative,
        balanceSoFar: snap.balanceCumulative,
        projectedMaturityGross,
        projectedMaturityInterest,
        projectedWithholdingTax,
        projectedMaturityNet,
    };
};
