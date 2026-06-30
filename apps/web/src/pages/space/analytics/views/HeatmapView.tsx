import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { KpiStrip, type KpiItem } from "@/components/shared/KpiStrip";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { AnalyticsFilterBar } from "../components/AnalyticsFilterBar";
import { useAnalyticsFilters } from "../components/useAnalyticsFilters";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { addMonths, startOfMonth } from "@/lib/dates";
import { formatInAppTz } from "@/lib/formatDate";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Spending calendar — twelve-month grid where every day is a real calendar
 * cell with intensity, dot markers for cadence-detected recurring charges,
 * a per-day sparkline, and a relative-month progress bar. The "year peak"
 * day gets a gold ring so the eye lands on it instantly.
 *
 * Layout mirrors the design canvas: 4-column × 3-row grid of month tiles.
 * Daily totals come from `spendingHeatmap`; recurring-charge dots come
 * from `recurring.list` filtered to monthly cadence.
 */
export default function HeatmapView() {
    const { space } = useCurrentSpace();
    const f = useAnalyticsFilters();

    /**
     * Window: most-recent 12 months ending at the start of the next month.
     * That gives 12 full months + the partial current one is handled by
     * the data simply being absent for future days.
     */
    const periodEnd = useMemo(
        () => addMonths(startOfMonth(new Date()), 1),
        []
    );
    const periodStart = useMemo(
        () => addMonths(periodEnd, -12),
        [periodEnd]
    );

    const qSpace = trpc.analytics.spendingHeatmap.useQuery(
        {
            spaceId: space.id,
            periodStart,
            periodEnd,
            envelopeIds: f.envelopeIdsArg,
            accountIds: f.accountIdsArg,
            categoryIds: f.categoryIdsArg,
        },
        { enabled: !space.isPersonal }
    );
    const qPersonal = trpc.personal.spendingHeatmap.useQuery(
        { periodStart, periodEnd, accountIds: f.accountIdsArg },
        { enabled: space.isPersonal }
    );
    const q = space.isPersonal ? qPersonal : qSpace;

    /* Recurring-bill dots — derived from the cadence detector. Filters:
       - kind: 'bill' only — subscriptions (Netflix, Spotify, etc.) are
         excluded since they cluster as background noise rather than
         loud signals worth highlighting on a yearly calendar.
       - cadence: 'monthly' only — weekly/biweekly drift across days,
         yearly only fires once.
       - Top-5 by avgAmount — caps visual density so the dots stay
         signal, not noise, even for users with many recurring bills. */
    const TOP_N_BILLS = 5;
    const recurringSpaceQ = trpc.analytics.recurring.useQuery(
        { spaceId: space.id, kind: "bill" },
        { enabled: !space.isPersonal }
    );
    const recurringPersonalQ = trpc.personal.recurring.useQuery(
        { kind: "bill" },
        { enabled: space.isPersonal }
    );
    const recurringData =
        (space.isPersonal
            ? recurringPersonalQ.data
            : recurringSpaceQ.data) ?? [];
    const recurringByDay = useMemo(() => {
        const m = new Map<number, { color: string; label: string; amount: number }>();
        /* The recurring detector runs over the whole space/owned set, so
           its dots would contradict the filtered cells (e.g. a bill paid
           from an account that's been filtered out). Hide them while any
           filter is active and restore on clear. */
        if (f.hasAnyFilter) return m;
        const monthlyBills = recurringData
            .filter((r) => r.cadence === "monthly")
            .sort((a, b) => b.avgAmount - a.avgAmount)
            .slice(0, TOP_N_BILLS);
        for (const r of monthlyBills) {
            const dt = r.nextExpectedDate
                ? new Date(r.nextExpectedDate)
                : new Date(r.lastSeen);
            /* Day-of-month read in app timezone (BST), not browser-local.
               `new Date(...)` is an absolute UTC instant; `getDate()`
               would resolve in the user's browser tz and could land the
               dot one day off the actual calendar tile (which is keyed
               by `formatInAppTz`-derived ymd strings). */
            const day = Number(formatInAppTz(dt, "d"));
            const existing = m.get(day);
            /* If two bills land on the same day (e.g. rent + insurance
               on the 1st), keep the larger one — it's the louder
               signal. The other is still in the data, just not dotted. */
            if (existing && existing.amount >= r.avgAmount) continue;
            m.set(day, {
                color: "var(--expense)",
                label: r.merchant,
                amount: r.avgAmount,
            });
        }
        return m;
    }, [recurringData, f.hasAnyFilter]);
    const hasBills = recurringByDay.size > 0;

    /** Indexed lookup: `YYYY-MM-DD` → spend total. */
    const byDay = useMemo(() => {
        const m = new Map<string, number>();
        for (const r of q.data ?? []) {
            m.set(formatInAppTz(r.day, "yyyy-MM-dd"), r.total);
        }
        return m;
    }, [q.data]);

    /** The 12 (year, month) pairs we render, oldest → newest.
     *  Year/month are read in app timezone — `addMonths(periodStart, i)`
     *  returns a BST-aligned moment, but its UTC fields are 6 hours
     *  before BST midnight and `dt.getFullYear()` would land in the
     *  prior month for any user east of UTC at the moment of January. */
    const months = useMemo(() => {
        const list: Array<{ y: number; m: number }> = [];
        for (let i = 0; i < 12; i++) {
            const dt = addMonths(periodStart, i);
            const y = Number(formatInAppTz(dt, "yyyy"));
            const m = Number(formatInAppTz(dt, "M")) - 1; // 1-12 → 0-11
            list.push({ y, m });
        }
        return list;
    }, [periodStart]);

    /** Per-month totals + grand stats used in the header KPIs. */
    const stats = useMemo(() => {
        let yearTotal = 0;
        let activeDays = 0;
        let peak = 0;
        let peakDate: Date | null = null;
        const monthTotals = months.map(({ y, m }) => {
            let total = 0;
            const daysInMonth = new Date(y, m + 1, 0).getDate();
            for (let d = 1; d <= daysInMonth; d++) {
                const key = ymd(y, m, d);
                const v = byDay.get(key) ?? 0;
                total += v;
                if (v > 0) {
                    activeDays++;
                    if (v > peak) {
                        peak = v;
                        peakDate = new Date(y, m, d);
                    }
                }
            }
            yearTotal += total;
            return { y, m, total };
        });
        const maxMonth = Math.max(1, ...monthTotals.map((x) => x.total));
        return {
            monthTotals,
            yearTotal,
            activeDays,
            peak,
            peakDate,
            maxMonth,
        };
    }, [months, byDay]);

    /** Histogram of average daily spend by weekday — drives the by-weekday card. */
    const byWeekday = useMemo(() => {
        const sums = [0, 0, 0, 0, 0, 0, 0];
        const counts = [0, 0, 0, 0, 0, 0, 0];
        byDay.forEach((v, key) => {
            const [yStr, mStr, dStr] = key.split("-");
            const dow = new Date(
                Number(yStr),
                Number(mStr) - 1,
                Number(dStr)
            ).getDay();
            sums[dow] += v;
            counts[dow]++;
        });
        return sums.map((s, i) => (counts[i] > 0 ? s / counts[i] : 0));
    }, [byDay]);

    /** Find the top 5 calendar weeks (Sun-Sat) by total spend. */
    const heaviestWeeks = useMemo(() => {
        const buckets = new Map<string, { start: Date; total: number }>();
        byDay.forEach((v, key) => {
            const [yStr, mStr, dStr] = key.split("-");
            const dt = new Date(
                Number(yStr),
                Number(mStr) - 1,
                Number(dStr)
            );
            const sunday = new Date(dt);
            sunday.setDate(dt.getDate() - dt.getDay());
            const bucketKey = ymd(
                sunday.getFullYear(),
                sunday.getMonth(),
                sunday.getDate()
            );
            const existing = buckets.get(bucketKey);
            if (existing) existing.total += v;
            else buckets.set(bucketKey, { start: sunday, total: v });
        });
        return Array.from(buckets.values())
            .filter((b) => b.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
    }, [byDay]);

    const isLoading = q.isLoading;
    const peakDateLabel = stats.peakDate
        ? formatInAppTz(stats.peakDate, "MMM d")
        : "—";
    const totalDaysInWindow = Math.round(
        (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    const kpiItems: KpiItem[] = [
        {
            label: "Year total",
            value: stats.yearTotal,
            money: true,
            tone: "expense",
        },
        {
            label: "Active days",
            value: stats.activeDays,
            valueFormat: "integer",
            sub:
                totalDaysInWindow > 0
                    ? `of ${totalDaysInWindow} · ${(
                          (stats.activeDays / totalDaysInWindow) *
                          100
                      ).toFixed(0)}% had any expense`
                    : "—",
        },
        {
            label: "Peak day",
            value: stats.peak,
            money: true,
            tone: "expense",
            sub: stats.peakDate ? peakDateLabel : "No spending yet",
        },
        {
            label: "Avg per active day",
            value:
                stats.activeDays > 0 ? stats.yearTotal / stats.activeDays : 0,
            money: true,
        },
    ];

    return (
        <AnalyticsDetailLayout
            title="Spending calendar"
            description="Every day of the last twelve months. Cell intensity shows daily spend; small dots mark detected recurring monthly charges; the gold cell is the year's peak day."
        >
            <AnalyticsFilterBar
                spaceId={space.id}
                isPersonal={space.isPersonal}
                envelopeIds={f.envelopeIds}
                accountIds={f.accountIds}
                categoryIds={f.categoryIds}
                onChange={f.setFilterIds}
                onClearAll={f.clearAllFilters}
                hasAnyFilter={f.hasAnyFilter}
            />

            <KpiStrip items={kpiItems} isLoading={isLoading} />

            <Card>
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <CardTitle>Twelve months at a glance</CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Each tile is one month · cell intensity = daily expense
                            · gold ring = year peak.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        {hasBills ? (
                            <Legend
                                dot
                                color="var(--expense)"
                                label={`Top ${recurringByDay.size} recurring bill${recurringByDay.size === 1 ? "" : "s"}`}
                            />
                        ) : null}
                        <Legend color="var(--warning)" label="Peak" ring />
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <Skeleton className="h-[640px] w-full" />
                    ) : (
                        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                            {months.map(({ y, m }, i) => {
                                const monthTotal =
                                    stats.monthTotals[i]?.total ?? 0;
                                const rel =
                                    stats.maxMonth > 0
                                        ? monthTotal / stats.maxMonth
                                        : 0;
                                return (
                                    <MonthTile
                                        key={`${y}-${m}`}
                                        year={y}
                                        month={m}
                                        byDay={byDay}
                                        monthTotal={monthTotal}
                                        relativeFraction={rel}
                                        peakDate={stats.peakDate}
                                        recurringByDay={recurringByDay}
                                    />
                                );
                            })}
                        </div>
                    )}

                    {!isLoading && (
                        <div className="mt-4 flex flex-col gap-2 border-t border-border/40 pt-3 sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-[11px] text-muted-foreground">
                                <span className="text-foreground/85">
                                    {totalDaysInWindow - stats.activeDays} days
                                </span>{" "}
                                with no spending
                            </span>
                            <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span>0</span>
                                {[0, 1, 2, 3, 4, 5].map((b) => {
                                    const r = ramp(b);
                                    return (
                                        <span
                                            key={b}
                                            className="inline-block size-4 rounded"
                                            style={{
                                                background: r.bg,
                                                border: `1px solid ${
                                                    r.border === "transparent"
                                                        ? "transparent"
                                                        : r.border
                                                }`,
                                            }}
                                        />
                                    );
                                })}
                                <span>600+</span>
                            </span>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-3.5 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>By weekday</CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Average daily spend, all months.
                        </p>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-44 w-full" />
                        ) : (
                            <div className="flex flex-col gap-2.5">
                                {WEEKDAY_FULL.map((d, i) => {
                                    const max = Math.max(...byWeekday, 1);
                                    const v = byWeekday[i];
                                    const isFriday = i === 5;
                                    return (
                                        <div
                                            key={d}
                                            className="grid items-center gap-3"
                                            style={{
                                                gridTemplateColumns:
                                                    "44px minmax(0, 1fr) 80px",
                                            }}
                                        >
                                            <span className="text-[12px] text-muted-foreground">
                                                {d}
                                            </span>
                                            <span className="relative block h-1.5 overflow-hidden rounded-full bg-muted/40">
                                                <span
                                                    className="absolute inset-y-0 left-0 rounded-full"
                                                    style={{
                                                        width: `${
                                                            (v / max) * 100
                                                        }%`,
                                                        backgroundColor: isFriday
                                                            ? "var(--warning)"
                                                            : "var(--primary)",
                                                    }}
                                                />
                                            </span>
                                            <MoneyDisplay
                                                amount={v}
                                                variant="neutral"
                                                className="text-right text-[12.5px] font-semibold"
                                            />
                                        </div>
                                    );
                                })}
                                {byWeekday.length > 0 && (
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                        {findHeaviestWeekdayLabel(byWeekday)}
                                    </p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Heaviest weeks</CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Top {heaviestWeeks.length || 5} spending weeks of the
                            year.
                        </p>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-44 w-full" />
                        ) : heaviestWeeks.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No weeks with spending yet.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-2.5">
                                {heaviestWeeks.map((w, i) => {
                                    const max = heaviestWeeks[0]?.total ?? 1;
                                    const end = new Date(w.start);
                                    end.setDate(w.start.getDate() + 6);
                                    return (
                                        <div
                                            key={i}
                                            className="grid items-center gap-3"
                                            style={{
                                                gridTemplateColumns:
                                                    "minmax(110px, auto) minmax(0, 1fr) 90px",
                                            }}
                                        >
                                            <span className="text-[12.5px] text-foreground/85">
                                                {formatInAppTz(w.start, "MMM d")}–
                                                {formatInAppTz(end, "d")}
                                            </span>
                                            <span className="relative block h-1.5 overflow-hidden rounded-full bg-muted/40">
                                                <span
                                                    className="absolute inset-y-0 left-0 rounded-full"
                                                    style={{
                                                        width: `${
                                                            (w.total / max) * 100
                                                        }%`,
                                                        backgroundColor:
                                                            "var(--warning)",
                                                    }}
                                                />
                                            </span>
                                            <MoneyDisplay
                                                amount={w.total}
                                                variant="neutral"
                                                className="text-right text-[12.5px] font-semibold"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AnalyticsDetailLayout>
    );
}

/* ============================================================
   MONTH TILE
   ============================================================ */

function MonthTile({
    year,
    month,
    byDay,
    monthTotal,
    relativeFraction,
    peakDate,
    recurringByDay,
}: {
    year: number;
    month: number;
    byDay: Map<string, number>;
    monthTotal: number;
    relativeFraction: number;
    peakDate: Date | null;
    recurringByDay: Map<
        number,
        { color: string; label: string; amount: number }
    >;
}) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startCol = new Date(year, month, 1).getDay();

    /** Build a 6×7 calendar grid (some weeks at the end may be empty). */
    const weeks: Array<Array<number | null>> = [];
    let dayIdx = 1;
    let week: Array<number | null> = new Array(7).fill(null);
    for (let c = 0; c < startCol; c++) week[c] = null;
    for (let c = startCol; c < 7; c++) {
        if (dayIdx <= daysInMonth) week[c] = dayIdx++;
    }
    weeks.push(week);
    while (dayIdx <= daysInMonth) {
        week = new Array(7).fill(null);
        for (let c = 0; c < 7 && dayIdx <= daysInMonth; c++) {
            week[c] = dayIdx++;
        }
        weeks.push(week);
    }

    const dailyValues: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
        dailyValues.push(byDay.get(ymd(year, month, d)) ?? 0);
    }
    const maxDaily = Math.max(1, ...dailyValues);

    const isPeakDay = (d: number): boolean => {
        if (!peakDate) return false;
        return (
            peakDate.getFullYear() === year &&
            peakDate.getMonth() === month &&
            peakDate.getDate() === d
        );
    };

    return (
        <div className="flex flex-col gap-2 rounded-xl border border-border/40 bg-card p-3">
            {/* Header */}
            <div className="flex items-baseline justify-between">
                <span className="inline-flex items-baseline gap-1.5">
                    <span className="text-[13px] font-medium tracking-wide">
                        {MONTH_NAMES[month]}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                        {year}
                    </span>
                </span>
                <MoneyDisplay
                    amount={monthTotal}
                    variant="neutral"
                    className="text-[11.5px] font-semibold"
                />
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-[2px] text-center text-[8.5px] tracking-wider text-muted-foreground">
                {WEEKDAY_LETTERS.map((w, i) => (
                    <span
                        key={i}
                        className={cn(
                            "h-3 leading-3",
                            (i === 0 || i === 6) && "text-muted-foreground/70"
                        )}
                    >
                        {w}
                    </span>
                ))}
            </div>

            {/* Day grid */}
            <div className="flex flex-col gap-[2px]">
                {weeks.map((wk, wi) => (
                    <div key={wi} className="grid grid-cols-7 gap-[2px]">
                        {wk.map((d, di) => {
                            if (d === null) {
                                return <span key={di} className="aspect-square" />;
                            }
                            const v = byDay.get(ymd(year, month, d)) ?? 0;
                            const b = bucketize(v);
                            const r = ramp(b);
                            const recurring = recurringByDay.get(d);
                            const peak = isPeakDay(d);
                            const baseTitle = `${MONTH_NAMES[month]} ${d} · ${formatMoney(v)}`;
                            const title = recurring
                                ? `${baseTitle} · ${recurring.label} (${formatMoney(recurring.amount)}/mo)`
                                : baseTitle;
                            return (
                                <span
                                    key={di}
                                    title={title}
                                    className="relative grid aspect-square place-items-center rounded text-[8.5px] font-medium tabular-nums"
                                    style={{
                                        background: r.bg,
                                        border: `1px solid ${
                                            peak ? "var(--warning)" : r.border
                                        }`,
                                        boxShadow: peak
                                            ? "0 0 0 1px color-mix(in oklab, var(--warning) 30%, transparent)"
                                            : undefined,
                                        color: r.fg,
                                    }}
                                >
                                    {d}
                                    {recurring && (
                                        <span
                                            className="absolute left-1/2 -translate-x-1/2 size-[3px] rounded-full"
                                            style={{
                                                bottom: "1.5px",
                                                background: recurring.color,
                                            }}
                                        />
                                    )}
                                </span>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Per-day sparkline */}
            <div className="flex items-end gap-px h-3.5 border-t border-border/40 pt-1">
                {dailyValues.map((v, i) => (
                    <span
                        key={i}
                        className="flex-1 rounded-[1px]"
                        style={{
                            height: `${
                                v === 0 ? 8 : Math.max(8, (v / maxDaily) * 100)
                            }%`,
                            background:
                                v === 0
                                    ? "var(--muted)"
                                    : `color-mix(in oklab, var(--warning) ${
                                          20 + (v / maxDaily) * 70
                                      }%, var(--muted))`,
                            opacity: v === 0 ? 0.4 : 1,
                        }}
                    />
                ))}
            </div>

            {/* Relative-to-peak month bar */}
            <div className="flex items-center gap-1.5">
                <span className="relative block h-[3px] flex-1 overflow-hidden rounded-full bg-muted/60">
                    <span
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                            width: `${Math.round(relativeFraction * 100)}%`,
                            backgroundColor: "var(--warning)",
                        }}
                    />
                </span>
                <span className="text-[9.5px] tabular-nums text-muted-foreground">
                    {Math.round(relativeFraction * 100)}%
                </span>
            </div>
        </div>
    );
}

/* ============================================================
   COLOR / BUCKET HELPERS
   ============================================================ */

/** Map a daily expense to one of 6 intensity buckets. */
function bucketize(v: number): number {
    if (v <= 0) return 0;
    if (v < 50) return 1;
    if (v < 150) return 2;
    if (v < 300) return 3;
    if (v < 600) return 4;
    return 5;
}

/**
 * Premium graphite → gold ramp. Index 0 is the empty cell, 5 is the most
 * intense. Mirrors the design's editorial-not-pink color choice.
 */
function ramp(b: number): { bg: string; border: string; fg: string } {
    if (b === 0) {
        return {
            bg: "var(--muted)",
            border: "var(--border)",
            fg: "var(--muted-foreground)",
        };
    }
    if (b === 1) {
        return {
            bg: "oklch(28% 0.02 80)",
            border: "var(--border)",
            fg: "var(--muted-foreground)",
        };
    }
    if (b === 2) {
        return {
            bg: "oklch(38% 0.05 78)",
            border: "transparent",
            fg: "var(--foreground)",
        };
    }
    if (b === 3) {
        return {
            bg: "oklch(55% 0.10 82)",
            border: "transparent",
            fg: "oklch(15% 0.02 80)",
        };
    }
    if (b === 4) {
        return {
            bg: "oklch(72% 0.13 85)",
            border: "transparent",
            fg: "oklch(15% 0.02 80)",
        };
    }
    return {
        bg: "var(--warning)",
        border: "transparent",
        fg: "oklch(15% 0.02 80)",
    };
}

/* ============================================================
   SMALL PIECES
   ============================================================ */

function Legend({
    color,
    label,
    dot = false,
    ring = false,
}: {
    color: string;
    label: string;
    dot?: boolean;
    ring?: boolean;
}) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span
                className={cn("inline-block", dot ? "size-1.5 rounded-full" : "size-2.5 rounded-sm")}
                style={{
                    background: color,
                    ...(ring
                        ? {
                              boxShadow:
                                  "0 0 0 1px color-mix(in oklab, var(--warning) 60%, transparent)",
                          }
                        : null),
                }}
            />
            {label}
        </span>
    );
}

function findHeaviestWeekdayLabel(byWeekday: number[]): string {
    let bestIdx = 0;
    let best = 0;
    for (let i = 0; i < byWeekday.length; i++) {
        if (byWeekday[i] > best) {
            best = byWeekday[i];
            bestIdx = i;
        }
    }
    if (best === 0) return "No spending recorded yet.";
    const avg = byWeekday.reduce((s, v) => s + v, 0) / byWeekday.length;
    const pctAbove = avg > 0 ? ((best - avg) / avg) * 100 : 0;
    return `${WEEKDAY_FULL[bestIdx]} is your heaviest spending day — ${pctAbove.toFixed(
        0
    )}% above your weekly average.`;
}

function ymd(y: number, m: number, d: number): string {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
