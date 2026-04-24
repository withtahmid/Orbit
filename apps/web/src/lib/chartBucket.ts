export type Bucket = "day" | "week" | "month" | "year";
export type BucketSelection = "auto" | Bucket;

export const BUCKET_LABEL: Record<Bucket, string> = {
    day: "Day",
    week: "Week",
    month: "Month",
    year: "Year",
};

/** Pick a bucket size based on the period span in days. */
export function autoBucket(start: Date, end: Date): Bucket {
    const days = Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / 86_400_000)
    );
    if (days <= 45) return "day";
    if (days <= 180) return "week";
    if (days <= 1095) return "month";
    return "year";
}

/** date-fns pattern for axis tick labels. */
export function bucketTickPattern(b: Bucket): string {
    if (b === "year") return "yyyy";
    if (b === "month") return "MMM yyyy";
    return "MMM d";
}

/** date-fns pattern for tooltip header labels (includes year for day/week). */
export function bucketLabelPattern(b: Bucket): string {
    if (b === "year") return "yyyy";
    if (b === "month") return "MMM yyyy";
    return "MMM d, yyyy";
}

/** Compact K/M suffix formatter for Y-axis ticks. Keeps sign, one decimal
 *  for small magnitudes and drops the decimal once the number is large
 *  enough that it adds no precision. */
export function compactMoney(v: number): string {
    const abs = Math.abs(v);
    if (abs >= 1_000_000)
        return `${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
    if (abs >= 1_000)
        return `${(v / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
    return v.toFixed(0);
}
