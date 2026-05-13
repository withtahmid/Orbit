import { ENV } from "../../../env.mjs";

/**
 * Build the expected installment date sequence for a DPS contract.
 *
 * Day-of-month math runs in `ENV.APP_TIMEZONE` (default Asia/Dhaka),
 * because the contract anchor is a wall-clock calendar day — never a
 * UTC instant. We construct a noon-Asia/Dhaka `Date` per installment
 * so naive `.toISOString()` callers can't accidentally drift the date
 * across the day boundary.
 *
 * End-of-month clamp: a scheme started on Jan 31 with installments on
 * the 31st falls back to Feb 28 (or 29 in leap years), Apr 30, etc.
 * This matches typical Bangladeshi bank auto-debit behavior — the bank
 * debits on the last day of the month when day-31 doesn't exist that
 * month.
 *
 * The first row is `start_date` itself; subsequent rows are
 * month-by-month from there, anchored on `installmentDay`.
 */
export type DpsInstallmentDate = {
    /** Month index (1..termMonths). Month 1 is the first installment. */
    index: number;
    /** Noon-Asia/Dhaka Date corresponding to the wall-clock day. */
    date: Date;
};

export const buildDpsSchedule = ({
    startDate,
    installmentDay,
    termMonths,
}: {
    startDate: Date;
    installmentDay: number;
    termMonths: number;
}): DpsInstallmentDate[] => {
    const rows: DpsInstallmentDate[] = [];
    const tz = ENV.APP_TIMEZONE;

    const startYear = extractTzField(startDate, tz, "year");
    const startMonth = extractTzField(startDate, tz, "month"); // 1..12
    const startDay = extractTzField(startDate, tz, "day");

    // Month 1: start_date itself.
    rows.push({
        index: 1,
        date: makeTzNoonDate(startYear, startMonth, startDay, tz),
    });

    for (let m = 2; m <= termMonths; m++) {
        const targetYear = startYear + Math.floor((startMonth - 1 + (m - 1)) / 12);
        const targetMonth = ((startMonth - 1 + (m - 1)) % 12) + 1;
        const dom = Math.min(installmentDay, daysInMonth(targetYear, targetMonth));
        rows.push({
            index: m,
            date: makeTzNoonDate(targetYear, targetMonth, dom, tz),
        });
    }

    return rows;
};

/**
 * Months elapsed since `startDate` as of `asOf`, capped at `termMonths`.
 * Counts the first installment day as month 1 (so the day a scheme is
 * opened the user has already paid 1 installment, matching the schedule
 * semantics).
 */
export const monthsElapsedSinceStart = ({
    startDate,
    asOf,
    termMonths,
}: {
    startDate: Date;
    asOf: Date;
    termMonths: number;
}): number => {
    const tz = ENV.APP_TIMEZONE;
    const sy = extractTzField(startDate, tz, "year");
    const sm = extractTzField(startDate, tz, "month");
    const sd = extractTzField(startDate, tz, "day");
    const ay = extractTzField(asOf, tz, "year");
    const am = extractTzField(asOf, tz, "month");
    const ad = extractTzField(asOf, tz, "day");

    let months = (ay - sy) * 12 + (am - sm);
    // If `asOf` is earlier than the day-of-month-of-month boundary,
    // the current month's installment hasn't happened yet, so the
    // count rolls back. We treat the start_date itself as installment
    // 1, so `months + 1` once we're past the boundary.
    const passedDayBoundary = ad >= Math.min(sd, daysInMonth(ay, am));
    const elapsed = months + (passedDayBoundary ? 1 : 0);

    return Math.max(0, Math.min(termMonths, elapsed));
};

/**
 * Maturity date: `start_date + termMonths` calendar months, clamped to
 * the installment day (so a Jan-31 start of 60-month term matures on
 * the last day of the maturity month).
 */
export const computeDpsMaturityDate = ({
    startDate,
    installmentDay,
    termMonths,
}: {
    startDate: Date;
    installmentDay: number;
    termMonths: number;
}): Date => {
    const tz = ENV.APP_TIMEZONE;
    const sy = extractTzField(startDate, tz, "year");
    const sm = extractTzField(startDate, tz, "month");

    // Maturity falls on the same day-of-month as the FIRST POST-START
    // anniversary `termMonths` later. A 5-year DPS opened 2024-04-01
    // matures 2029-04-01 (the day the 60th installment was due).
    const targetYear = sy + Math.floor((sm - 1 + termMonths) / 12);
    const targetMonth = ((sm - 1 + termMonths) % 12) + 1;
    const dom = Math.min(installmentDay, daysInMonth(targetYear, targetMonth));
    return makeTzNoonDate(targetYear, targetMonth, dom, tz);
};

// ---- low-level tz helpers (no deps) -----------------------------------------

const tzFormatterCache: Record<string, Intl.DateTimeFormat> = {};
const getFmt = (tz: string) => {
    let f = tzFormatterCache[tz];
    if (!f) {
        f = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour12: false,
        });
        tzFormatterCache[tz] = f;
    }
    return f;
};

const extractTzField = (
    date: Date,
    tz: string,
    field: "year" | "month" | "day"
): number => {
    const parts = getFmt(tz).formatToParts(date);
    const map: Record<string, number> = {};
    for (const p of parts) {
        if (p.type === "year" || p.type === "month" || p.type === "day") {
            map[p.type] = Number(p.value);
        }
    }
    return map[field]!;
};

const daysInMonth = (year: number, month: number): number => {
    // Construct a UTC Date for the first of the *next* month, then step
    // back one day. Works for any Gregorian month/year including leap
    // Februarys.
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

/**
 * Build a `Date` whose Asia/Dhaka wall-clock noon is the given
 * (year, month, day). Noon is chosen so subsequent `.toISOString()` /
 * `::date` reads can't cross a day boundary regardless of viewing tz.
 */
const makeTzNoonDate = (year: number, month: number, day: number, tz: string): Date => {
    // Asia/Dhaka is fixed UTC+6, no DST. For other zones we'd need a
    // proper offset-aware constructor; the env default is Asia/Dhaka so
    // this is safe for the v1 deployment. Compute the offset by reading
    // the timezone's interpretation of a known UTC instant and diffing.
    // For non-DST zones this is a constant.
    const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const tzNoonStr = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hour12: false,
    }).formatToParts(probe);
    const seen: Record<string, number> = {};
    for (const p of tzNoonStr) {
        if (p.type === "year" || p.type === "month" || p.type === "day" || p.type === "hour") {
            seen[p.type] = Number(p.value);
        }
    }
    // The probe is 12:00 UTC. In Asia/Dhaka (UTC+6) it shows 18:00.
    // To get 12:00 wall-clock we need to subtract `(seenHour - 12)`
    // hours from the probe.
    const offsetHours = (seen.hour ?? 12) - 12;
    return new Date(probe.getTime() - offsetHours * 3600 * 1000);
};
