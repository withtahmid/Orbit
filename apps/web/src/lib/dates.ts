export function startOfMonth(date = new Date()): Date {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function endOfMonth(date = new Date()): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

export function addMonths(date: Date, months: number): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}

export function startOfDay(date = new Date()): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function endOfDay(date = new Date()): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

export function startOfWeek(date = new Date()): Date {
    const d = startOfDay(date);
    const day = d.getDay(); // 0 = Sunday
    d.setDate(d.getDate() - day);
    return d;
}

export function startOfYear(date = new Date()): Date {
    return new Date(date.getFullYear(), 0, 1);
}

export function endOfYear(date = new Date()): Date {
    return new Date(date.getFullYear() + 1, 0, 1);
}

/** Format yyyy-MM-dd suitable for date-only inputs, timezone-safe local. */
export function toInputDate(d: Date | null | undefined): string {
    if (!d) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

/** Format yyyy-MM-ddTHH:mm suitable for datetime-local inputs. */
export function toInputDateTime(d: Date | null | undefined): string {
    if (!d) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
