/**
 * Shared recurring-charge classifiers. The detector SQL produces one row
 * per (account, merchant) group with an `avg_interval_days` between
 * consecutive hits; these helpers convert that into a cadence label and
 * a kind (bill vs subscription). Used by `analytics.recurring`,
 * `personal.recurring`, and the anomaly procedures so every surface
 * agrees on what "recurring" means.
 */

export type RecurringRow = {
    merchant_key: string;
    merchant: string;
    source_account_id: string;
    expense_category_id: string | null;
    hits: string;
    avg_amount: string;
    last_amount: string;
    prev_amount: string | null;
    last_seen: Date;
    prev_date: Date | null;
    first_seen: Date;
    avg_interval_days: string | null;
};

export type Cadence = "weekly" | "biweekly" | "monthly" | "yearly";
export type RecurringKind = "bill" | "subscription";

/** Map an average inter-arrival interval to a discrete cadence label.
 *
 * Known limitation: this is variance-blind — three hits at days 0, 0, 60
 * give avg=30 and get labeled "monthly" even though the actual gaps are
 * 0d and 60d (chaotic). Adding a per-pair stddev check would require
 * window-function aggregation in every detector SQL site (canonical
 * `recurring`, plus anomaliesRecurring, anomaliesPatternBreaks, and the
 * personal twins of all three). Leaving as TODO until the false-positive
 * rate matters in practice. */
export function classifyCadence(intervalDays: number | null): Cadence | null {
    if (intervalDays == null) return null;
    if (intervalDays >= 5 && intervalDays <= 9) return "weekly";
    if (intervalDays >= 12 && intervalDays <= 17) return "biweekly";
    if (intervalDays >= 24 && intervalDays <= 35) return "monthly";
    if (intervalDays >= 350 && intervalDays <= 400) return "yearly";
    return null;
}

/**
 * Heuristic split between "bill" and "subscription". Subscriptions are
 * typically small monthly charges (Netflix, Spotify, etc.); larger or
 * non-monthly recurring expenses get classified as bills.
 */
export function classifyKind(cadence: Cadence, avgAmount: number): RecurringKind {
    if (cadence === "monthly" && avgAmount < 50) return "subscription";
    return "bill";
}
