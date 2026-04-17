/**
 * Period-window helpers for envelope cadence.
 *
 * "Period" is a `[start, end)` window derived from an envelope's cadence and
 * a reference instant. All arithmetic lives here so callers don't recompute
 * month boundaries in five different places.
 */

export type Cadence = "none" | "monthly";

export interface PeriodWindow {
    /** Inclusive start of the period, at 00:00 local server time. */
    start: Date;
    /** Exclusive end of the period. */
    end: Date;
    /** Convenience: previous period's window, same cadence. */
    prevStart: Date;
    prevEnd: Date;
}

/** Timestamp well before any real transaction, used as `start` when cadence='none'. */
const EPOCH = new Date("1970-01-01T00:00:00Z");
/** Timestamp well after any real transaction, used as `end` when cadence='none'. */
const FOREVER = new Date("9999-12-31T00:00:00Z");

export function resolvePeriodWindow(cadence: Cadence, at: Date = new Date()): PeriodWindow {
    if (cadence === "none") {
        return {
            start: EPOCH,
            end: FOREVER,
            // For cadence='none' there is no "previous period" — callers that
            // use carry_over check cadence first, so these values are never
            // materially read. Returning EPOCH/EPOCH keeps the type honest.
            prevStart: EPOCH,
            prevEnd: EPOCH,
        };
    }
    // 'monthly' — calendar month boundaries in UTC.
    const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
    const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
    const prevStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - 1, 1));
    const prevEnd = start;
    return { start, end, prevStart, prevEnd };
}

/**
 * Given an allocation's `period_start` (may be NULL) and `created_at`, return
 * the effective period start for cadence purposes. For cadence='none' the
 * value doesn't matter — all allocations live in the single window.
 */
export function effectivePeriodStart(
    cadence: Cadence,
    periodStart: Date | null,
    createdAt: Date
): Date {
    if (cadence === "none") return EPOCH;
    if (periodStart) {
        return new Date(
            Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), 1)
        );
    }
    return new Date(Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), 1));
}
