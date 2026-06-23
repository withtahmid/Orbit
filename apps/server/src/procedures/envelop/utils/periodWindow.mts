/**
 * Period-window helpers for envelope cadence.
 *
 * "Period" is a `[start, end)` window derived from an envelope's cadence and
 * a reference instant. All arithmetic lives here so callers don't recompute
 * month boundaries in several different places.
 *
 * Month boundaries are computed in **APP_TIMEZONE** (the same zone the
 * Postgres session runs in — see `db/index.mts`), so a JS-computed window
 * lines up with SQL `date_trunc('month', …)` / `::date` casts. Native
 * `Date.UTC(...)` would silently use UTC and drift the boundary by the
 * zone offset for any user.
 */

import { ENV } from "../../../env.mjs";

export type Cadence = "none" | "monthly";

export interface PeriodWindow {
    /** Inclusive start of the period (APP_TZ month start), as an absolute instant. */
    start: Date;
    /** Exclusive end of the period (next APP_TZ month start). */
    end: Date;
}

/** Timestamp well before any real transaction, used as `start` when cadence='none'. */
const EPOCH = new Date("1970-01-01T00:00:00Z");
/** Timestamp well after any real transaction, used as `end` when cadence='none'. */
const FOREVER = new Date("9999-12-31T00:00:00Z");

/**
 * Offset (ms) east of UTC for APP_TIMEZONE at the given instant. Positive =
 * ahead of UTC. Uses Intl so it stays correct for any IANA zone (including
 * DST), not just the fixed-offset Asia/Dhaka default.
 */
function appTzOffsetMs(at: Date): number {
    const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: ENV.APP_TIMEZONE,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
    const parts: Record<string, string> = {};
    for (const p of dtf.formatToParts(at)) parts[p.type] = p.value;
    // 24:00 normalizes to hour "24" in some engines for midnight.
    const hour = parts.hour === "24" ? 0 : Number(parts.hour);
    const asUTC = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        hour,
        Number(parts.minute),
        Number(parts.second)
    );
    return asUTC - at.getTime();
}

/** Wall-clock year/month (0-based) in APP_TIMEZONE for an instant. */
function appTzYearMonth(at: Date): { year: number; month: number } {
    const offset = appTzOffsetMs(at);
    const projected = new Date(at.getTime() + offset);
    return { year: projected.getUTCFullYear(), month: projected.getUTCMonth() };
}

/**
 * Absolute instant for APP_TZ wall-clock midnight on the 1st of the given
 * (year, 0-based month). Guess-and-correct handles the DST edge for
 * non-Dhaka zones; for Asia/Dhaka (no DST) the first pass is exact.
 */
function appTzMonthStartInstant(year: number, month: number): Date {
    const asIfUTC = Date.UTC(year, month, 1, 0, 0, 0);
    const guess = new Date(asIfUTC);
    const offset = appTzOffsetMs(guess);
    let result = new Date(asIfUTC - offset);
    const offset2 = appTzOffsetMs(result);
    if (offset2 !== offset) result = new Date(asIfUTC - offset2);
    return result;
}

/** APP_TZ month start (as an absolute instant) for the month containing `at`. */
export function appTzMonthStart(at: Date): Date {
    const { year, month } = appTzYearMonth(at);
    return appTzMonthStartInstant(year, month);
}

export function resolvePeriodWindow(
    cadence: Cadence,
    at: Date = new Date()
): PeriodWindow {
    if (cadence === "none") {
        return { start: EPOCH, end: FOREVER };
    }
    const { year, month } = appTzYearMonth(at);
    return {
        start: appTzMonthStartInstant(year, month),
        end: appTzMonthStartInstant(year, month + 1),
    };
}

/**
 * Given an optional caller-supplied `period_start` and a reference instant,
 * return the effective APP_TZ month-start to store/query against. For
 * cadence='none' the value is irrelevant — those rows store NULL.
 */
export function effectivePeriodStart(
    cadence: Cadence,
    periodStart: Date | null,
    at: Date
): Date {
    if (cadence === "none") return EPOCH;
    return appTzMonthStart(periodStart ?? at);
}
