/**
 * App-wide timezone. Mirrors the server's `ENV.APP_TIMEZONE`. The whole
 * UI (period windows, datetime inputs, formatted display) interprets
 * wall-clock times in this zone so users in any timezone see consistent
 * boundaries that match what the server computes.
 *
 * Dhaka is UTC+06:00 year-round (no DST), so we can implement this with
 * a fixed offset + cheap Date arithmetic rather than pulling in
 * date-fns-tz. If this ever changes to a zone with DST — or we add
 * per-space timezones — swap to `date-fns-tz` and keep the helper
 * signatures.
 */
export const APP_TIMEZONE = "Asia/Dhaka";

/** Minutes east of UTC for Asia/Dhaka. Positive = ahead of UTC. */
const APP_TZ_OFFSET_MIN = 6 * 60;

/**
 * Return a Date whose *UTC fields* (getUTCFullYear etc.) represent the
 * wall-clock in APP_TIMEZONE for the given absolute moment. Not a real
 * moment in time — use `unprojectFromAppTz` to get back a true Date.
 */
function projectToAppTz(absolute: Date): Date {
    return new Date(absolute.getTime() + APP_TZ_OFFSET_MIN * 60_000);
}

/**
 * Inverse: given a Date whose UTC fields represent APP_TIMEZONE
 * wall-clock, return the true absolute moment.
 */
function unprojectFromAppTz(projected: Date): Date {
    return new Date(projected.getTime() - APP_TZ_OFFSET_MIN * 60_000);
}

/**
 * Return a Date shifted so its *local-time fields* (getFullYear etc. on
 * the browser's tz) equal the APP_TIMEZONE wall-clock for the original
 * moment. Used when feeding values to `date-fns` `format()` so the
 * display matches APP_TIMEZONE regardless of the user's browser tz.
 */
export function shiftForFormat(absolute: Date): Date {
    const userOffsetMin = absolute.getTimezoneOffset(); // minutes to add to local to get UTC
    // We want localFields == APP_TZ wall-clock.
    //   localFields = absolute - userOffsetMin minutes
    //   appTz wall-clock = absolute + APP_TZ_OFFSET_MIN minutes (in UTC field space)
    // So we need to shift by (APP_TZ_OFFSET_MIN + userOffsetMin) minutes.
    return new Date(
        absolute.getTime() + (APP_TZ_OFFSET_MIN + userOffsetMin) * 60_000
    );
}

export function startOfMonth(date: Date = new Date()): Date {
    const p = projectToAppTz(date);
    const start = new Date(
        Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), 1, 0, 0, 0, 0)
    );
    return unprojectFromAppTz(start);
}

export function endOfMonth(date: Date = new Date()): Date {
    // Return the start of the next month (exclusive end), matching
    // existing call-site semantics.
    const p = projectToAppTz(date);
    const start = new Date(
        Date.UTC(p.getUTCFullYear(), p.getUTCMonth() + 1, 1, 0, 0, 0, 0)
    );
    return unprojectFromAppTz(start);
}

export function addDays(date: Date, days: number): Date {
    const p = projectToAppTz(date);
    const shifted = new Date(
        Date.UTC(
            p.getUTCFullYear(),
            p.getUTCMonth(),
            p.getUTCDate() + days,
            p.getUTCHours(),
            p.getUTCMinutes(),
            p.getUTCSeconds(),
            p.getUTCMilliseconds()
        )
    );
    return unprojectFromAppTz(shifted);
}

export function addMonths(date: Date, months: number): Date {
    const p = projectToAppTz(date);
    const shifted = new Date(
        Date.UTC(
            p.getUTCFullYear(),
            p.getUTCMonth() + months,
            p.getUTCDate(),
            p.getUTCHours(),
            p.getUTCMinutes(),
            p.getUTCSeconds(),
            p.getUTCMilliseconds()
        )
    );
    return unprojectFromAppTz(shifted);
}

export function startOfDay(date: Date = new Date()): Date {
    const p = projectToAppTz(date);
    const start = new Date(
        Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate(), 0, 0, 0, 0)
    );
    return unprojectFromAppTz(start);
}

export function endOfDay(date: Date = new Date()): Date {
    const p = projectToAppTz(date);
    const end = new Date(
        Date.UTC(
            p.getUTCFullYear(),
            p.getUTCMonth(),
            p.getUTCDate(),
            23,
            59,
            59,
            999
        )
    );
    return unprojectFromAppTz(end);
}

export function startOfWeek(date: Date = new Date()): Date {
    const sod = startOfDay(date);
    const p = projectToAppTz(sod);
    const day = p.getUTCDay(); // 0 = Sunday in APP_TZ wall-clock
    return addDays(sod, -day);
}

export function startOfYear(date: Date = new Date()): Date {
    const p = projectToAppTz(date);
    const start = new Date(Date.UTC(p.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
    return unprojectFromAppTz(start);
}

export function endOfYear(date: Date = new Date()): Date {
    const p = projectToAppTz(date);
    const start = new Date(Date.UTC(p.getUTCFullYear() + 1, 0, 1, 0, 0, 0, 0));
    return unprojectFromAppTz(start);
}

/**
 * Format yyyy-MM-dd in APP_TIMEZONE, suitable for date-only inputs.
 * Reading the projected UTC fields gives the APP_TZ wall-clock date
 * regardless of the user's browser tz.
 */
export function toInputDate(d: Date | null | undefined): string {
    if (!d) return "";
    const p = projectToAppTz(d);
    const yyyy = p.getUTCFullYear();
    const mm = String(p.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(p.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Format yyyy-MM-ddTHH:mm in APP_TIMEZONE for datetime-local inputs.
 * The HTML input is timezone-unaware, so we display the value as if the
 * user were in APP_TIMEZONE.
 */
export function toInputDateTime(d: Date | null | undefined): string {
    if (!d) return "";
    const p = projectToAppTz(d);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${p.getUTCFullYear()}-${pad(p.getUTCMonth() + 1)}-${pad(
        p.getUTCDate()
    )}T${pad(p.getUTCHours())}:${pad(p.getUTCMinutes())}`;
}

/**
 * Parse a datetime-local input value (`YYYY-MM-DDTHH:mm`) as an absolute
 * moment, interpreting the wall-clock as APP_TIMEZONE. Use this instead
 * of `new Date(inputValue)` — the built-in constructor would interpret
 * the string as the browser's local tz, so a user outside APP_TIMEZONE
 * would save a time that's off by their local offset from APP_TIMEZONE.
 */
export function fromInputDateTime(v: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(v);
    if (!m) return new Date(NaN);
    // Build the APP_TZ wall-clock as a UTC-field Date, then unproject.
    const projected = new Date(
        Date.UTC(
            Number(m[1]),
            Number(m[2]) - 1,
            Number(m[3]),
            Number(m[4]),
            Number(m[5]),
            Number(m[6] ?? 0),
            0
        )
    );
    return unprojectFromAppTz(projected);
}

/**
 * Parse a date-only input value (`YYYY-MM-DD`) as the start of that day
 * in APP_TIMEZONE.
 */
export function fromInputDate(v: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return null;
    const projected = new Date(
        Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
    );
    return unprojectFromAppTz(projected);
}

export type PeriodPresetId =
    | "this-month"
    | "last-month"
    | "last-3-months"
    | "last-6-months"
    | "last-12-months"
    | "this-year"
    | "all-time"
    | "custom";

export interface PeriodRange {
    preset: PeriodPresetId;
    start: Date;
    end: Date;
}

/** Convert a preset id to a concrete {start, end} range (end is exclusive). */
export function resolvePeriod(
    preset: PeriodPresetId,
    customStart?: Date,
    customEnd?: Date
): PeriodRange {
    const now = new Date();
    if (preset === "this-month") {
        const start = startOfMonth(now);
        return { preset, start, end: addMonths(start, 1) };
    }
    if (preset === "last-month") {
        const end = startOfMonth(now);
        return { preset, start: addMonths(end, -1), end };
    }
    if (preset === "last-3-months") {
        const end = addMonths(startOfMonth(now), 1);
        return { preset, start: addMonths(end, -3), end };
    }
    if (preset === "last-6-months") {
        const end = addMonths(startOfMonth(now), 1);
        return { preset, start: addMonths(end, -6), end };
    }
    if (preset === "last-12-months") {
        const end = addMonths(startOfMonth(now), 1);
        return { preset, start: addMonths(end, -12), end };
    }
    if (preset === "this-year") {
        return { preset, start: startOfYear(now), end: endOfYear(now) };
    }
    if (preset === "all-time") {
        return { preset, start: new Date("1970-01-01"), end: new Date("9999-12-31") };
    }
    // custom
    const start = customStart ?? startOfMonth(now);
    const end = customEnd ?? addMonths(start, 1);
    return { preset, start, end };
}

export const PERIOD_LABELS: Record<PeriodPresetId, string> = {
    "this-month": "This month",
    "last-month": "Last month",
    "last-3-months": "Last 3 months",
    "last-6-months": "Last 6 months",
    "last-12-months": "Last 12 months",
    "this-year": "This year",
    "all-time": "All time",
    custom: "Custom",
};
