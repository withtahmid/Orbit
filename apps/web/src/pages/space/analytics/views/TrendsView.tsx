import { useMemo } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { KpiStrip, type KpiItem } from "@/components/shared/KpiStrip";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { cn } from "@/lib/utils";

/* ============================================================
   DUMMY FIXTURES — replace with tRPC queries when backend lands.
   Numbers chosen to mirror the design canvas so the view reads
   the same after-image as the screenshot.
   ============================================================ */

const TODAY = 26;
const DAYS_IN_MONTH = 30;

/** Daily spend for the current month (only first `TODAY` entries are real). */
const CUR_DAILY = [
    42, 18, 0, 65, 35, 110, 240, 12, 0, 28, 145, 52, 38, 86, 0, 14, 195, 48, 22,
    7, 280, 92, 34, 18, 162, 88,
];
/** Daily spend for the prior month (full 30 days). */
const PRV_DAILY = [
    38, 22, 8, 51, 41, 95, 180, 18, 11, 32, 78, 60, 33, 72, 5, 22, 110, 38, 28,
    14, 165, 75, 29, 12, 95, 76, 50, 41, 60, 90,
];

/** YoY monthly spend — 12 trailing months of this year vs last year. */
const YOY_MONTHS = [
    "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr",
];
const THIS_YEAR_BASE = [3200, 3450, 3100, 4120, 3680, 3220, 3880, 5410, 3620, 3950, 4280];
const LAST_YEAR = [2800, 2950, 2780, 3220, 3110, 2890, 3210, 4180, 3010, 3140, 3380, 3540];

/** Categories with the largest absolute month-over-month change. */
const MOVERS = [
    {
        name: "Photography Gear",
        cur: 245,
        prv: 0,
        color: "#22d3ee",
        icon: "sparkle",
        note: "First time this category was used",
    },
    {
        name: "Subscriptions",
        cur: 78,
        prv: 245,
        color: "#f59e0b",
        icon: "repeat",
        note: "Cancelled 3 services in March",
    },
    {
        name: "Coffee",
        cur: 79,
        prv: 65,
        color: "#fb923c",
        icon: "coffee",
        note: "+$14 — same daily pattern",
    },
    {
        name: "Travel",
        cur: 0,
        prv: 1820,
        color: "#a855f7",
        icon: "share",
        note: "No trips planned in April",
    },
];

/* ============================================================
   VIEW
   ============================================================ */

export default function TrendsView() {
    const cumulative = useMemo(() => {
        const cur: number[] = [];
        const prv: number[] = [];
        let curAcc = 0;
        let prvAcc = 0;
        for (let i = 0; i < DAYS_IN_MONTH; i++) {
            curAcc += CUR_DAILY[i] ?? 0;
            prvAcc += PRV_DAILY[i] ?? 0;
            cur.push(curAcc);
            prv.push(prvAcc);
        }
        return { cur, prv };
    }, []);

    const monthSoFar = cumulative.cur[TODAY - 1];
    const lastMonthSoFar = cumulative.prv[TODAY - 1];
    const lastMonthFull = cumulative.prv[DAYS_IN_MONTH - 1];
    const dailyAvg = monthSoFar / TODAY;
    const projected = dailyAvg * DAYS_IN_MONTH;
    const paceDelta = lastMonthSoFar > 0
        ? ((monthSoFar / lastMonthSoFar - 1) * 100)
        : 0;

    const kpiItems: KpiItem[] = [
        {
            label: "Spent so far",
            value: monthSoFar,
            money: true,
            sub: `Day ${TODAY} of ${DAYS_IN_MONTH}`,
        },
        {
            label: "Daily burn",
            value: dailyAvg,
            money: true,
            sub: "Avg per day this month",
        },
        {
            label: "Pace vs last month",
            value: paceDelta,
            valueFormat: "percent",
            tone: paceDelta > 0 ? "expense" : "income",
            sub:
                paceDelta > 0
                    ? "ahead — spending faster"
                    : "behind — spending slower",
        },
        {
            label: "Projected month",
            value: projected,
            money: true,
            sub: `vs $${formatMoneyShort(lastMonthFull)} last month`,
        },
    ];

    const yoyThisYear = [...THIS_YEAR_BASE, monthSoFar];

    return (
        <AnalyticsDetailLayout
            title="Spending trends"
            description="How spending is moving — this month vs last, this year vs last, and a forecast based on your current burn rate."
        >
            <KpiStrip items={kpiItems} />

            <Card>
                <CardHeader>
                    <CardTitle>Cumulative spend race</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Today is day {TODAY} · projection extends to month-end
                        based on current daily average.
                    </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <CumulativeRaceChart
                        cur={cumulative.cur}
                        prv={cumulative.prv}
                        today={TODAY}
                        daysInMonth={DAYS_IN_MONTH}
                        projection={projected}
                    />
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
                        <LegendItem
                            color="var(--warning)"
                            label="This month (so far)"
                            kind="solid"
                        />
                        <LegendItem
                            color="var(--muted-foreground)"
                            label="Last month"
                            kind="dashed"
                        />
                        <LegendItem
                            color="var(--warning)"
                            label="Projection"
                            kind="dotted"
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <Card>
                    <CardHeader>
                        <CardTitle>Year-over-year</CardTitle>
                        <p className="text-xs text-muted-foreground">
                            This year (solid) vs last year (faded). Shaded gap shows
                            growth or shrinkage.
                        </p>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <YoYBars
                            labels={YOY_MONTHS}
                            thisYear={yoyThisYear}
                            lastYear={LAST_YEAR}
                        />
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
                            <span>
                                <span className="font-semibold text-foreground">+18%</span>{" "}
                                · trailing 12mo total vs prior 12mo
                            </span>
                            <span className="ml-auto">
                                Heaviest growth:{" "}
                                <span className="font-semibold text-[color:var(--expense)]">
                                    March (+27%)
                                </span>
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Velocity</CardTitle>
                        <p className="text-xs text-muted-foreground">
                            How fast money is leaving.
                        </p>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2.5">
                        <VelocityRow
                            label="$/day this month"
                            value={184.62}
                            sub="Smoothed over 7 days"
                        />
                        <VelocityRow
                            label="$/day last month"
                            value={117.92}
                            sub="Same window, prior month"
                            muted
                        />
                        <VelocityRow
                            label="Acceleration"
                            value={56.6}
                            sub="% change in daily burn"
                            tone="expense"
                            unit="%"
                            decimals={1}
                        />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <div>
                        <CardTitle>Biggest movers</CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Categories with the largest absolute change vs last month.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                        View all →
                    </button>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                        {MOVERS.map((m) => {
                            const delta = m.cur - m.prv;
                            const up = delta >= 0;
                            return (
                                <div
                                    key={m.name}
                                    className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/20 p-3.5"
                                >
                                    <EntityAvatar
                                        size="md"
                                        color={m.color}
                                        icon={m.icon}
                                    />
                                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <span className="truncate text-[13px] font-medium">
                                            {m.name}
                                        </span>
                                        <span className="truncate text-[11px] text-muted-foreground">
                                            {m.note}
                                        </span>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                                        <span
                                            className={cn(
                                                "inline-flex items-center gap-0.5 text-[11.5px] font-medium tabular-nums",
                                                up
                                                    ? "text-[color:var(--expense)]"
                                                    : "text-[color:var(--income)]"
                                            )}
                                        >
                                            {up ? (
                                                <ArrowUp className="size-3" />
                                            ) : (
                                                <ArrowDown className="size-3" />
                                            )}
                                            {up ? "+" : "−"}$
                                            {Math.abs(delta).toLocaleString("en-US")}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground tabular-nums">
                                            ${m.prv} → ${m.cur}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </AnalyticsDetailLayout>
    );
}

/* ============================================================
   CHARTS — hand-rolled SVG (no recharts) to match the design's
   editorial-dark aesthetic exactly: dotted grid, shaded area
   under the cumulative line, "Today" marker, and inline labels
   on the projection / last-month endpoints.
   ============================================================ */

function CumulativeRaceChart({
    cur,
    prv,
    today,
    daysInMonth,
    projection,
}: {
    cur: number[];
    prv: number[];
    today: number;
    daysInMonth: number;
    projection: number;
}) {
    const w = 800;
    const h = 240;
    const p = 30;
    const max =
        Math.max(prv[prv.length - 1], cur[today - 1], projection) * 1.1;
    const sx = (i: number) => p + (i / (daysInMonth - 1)) * (w - p * 2);
    const sy = (v: number) => h - p - (v / max) * (h - p * 2);
    const todayX = sx(today - 1);
    const todayY = sy(cur[today - 1]);

    const prvPath = prv
        .map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`)
        .join(" ");
    const curSlice = cur.slice(0, today);
    const curPath = curSlice
        .map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`)
        .join(" ");
    const projPath = `M${todayX} ${todayY} L${sx(daysInMonth - 1)} ${sy(projection)}`;
    const curArea = `${curPath} L ${todayX} ${h - p} L ${p} ${h - p} Z`;

    /** Day-axis ticks — sparse so the labels don't crowd. */
    const dayTicks = [1, 7, 14, 21, daysInMonth];

    return (
        <div className="overflow-visible">
            <svg
                viewBox={`0 0 ${w} ${h}`}
                width="100%"
                height={h}
                role="img"
                aria-label="Cumulative spend chart"
            >
                <defs>
                    <linearGradient id="trendGrad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--warning)" stopOpacity="0.28" />
                        <stop
                            offset="100%"
                            stopColor="var(--warning)"
                            stopOpacity="0"
                        />
                    </linearGradient>
                </defs>

                {/* Y gridlines + tick labels */}
                {[0, 1, 2, 3, 4].map((i) => {
                    const y = p + (i * (h - p * 2)) / 4;
                    return (
                        <g key={i}>
                            <line
                                x1={p}
                                x2={w - p}
                                y1={y}
                                y2={y}
                                stroke="var(--border)"
                                strokeDasharray="2 4"
                            />
                            <text
                                x={p - 6}
                                y={y + 3}
                                fontSize="9.5"
                                fill="var(--muted-foreground)"
                                textAnchor="end"
                            >
                                ${(((4 - i) * max) / 4 / 1000).toFixed(1)}K
                            </text>
                        </g>
                    );
                })}

                {/* Today marker */}
                <line
                    x1={todayX}
                    x2={todayX}
                    y1={p}
                    y2={h - p}
                    stroke="var(--warning)"
                    strokeOpacity={0.4}
                    strokeDasharray="3 4"
                />
                <text
                    x={todayX + 6}
                    y={p + 12}
                    fontSize="10"
                    fill="var(--warning)"
                    fontWeight={500}
                >
                    Today
                </text>

                {/* Last month line (dashed muted) */}
                <path
                    d={prvPath}
                    fill="none"
                    stroke="var(--muted-foreground)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    opacity={0.7}
                />
                {/* Current month area + line */}
                <path d={curArea} fill="url(#trendGrad)" />
                <path
                    d={curPath}
                    fill="none"
                    stroke="var(--warning)"
                    strokeWidth={2}
                />
                {/* Projection line */}
                <path
                    d={projPath}
                    fill="none"
                    stroke="var(--warning)"
                    strokeWidth={1.5}
                    strokeDasharray="2 3"
                    opacity={0.7}
                />

                {/* Endpoint markers */}
                <circle cx={todayX} cy={todayY} r={4} fill="var(--warning)" />
                <circle
                    cx={sx(daysInMonth - 1)}
                    cy={sy(projection)}
                    r={3}
                    fill="var(--warning)"
                    opacity={0.5}
                />
                <text
                    x={sx(daysInMonth - 1) - 6}
                    y={sy(projection) - 6}
                    fontSize="10"
                    fill="var(--warning)"
                    textAnchor="end"
                >
                    Projected ${(projection / 1000).toFixed(1)}K
                </text>
                <circle
                    cx={sx(daysInMonth - 1)}
                    cy={sy(prv[prv.length - 1])}
                    r={3}
                    fill="var(--muted-foreground)"
                />
                <text
                    x={sx(daysInMonth - 1) - 6}
                    y={sy(prv[prv.length - 1]) - 6}
                    fontSize="10"
                    fill="var(--muted-foreground)"
                    textAnchor="end"
                >
                    Last ${(prv[prv.length - 1] / 1000).toFixed(1)}K
                </text>
            </svg>
            {/* Day axis */}
            <div className="mt-1 flex justify-between text-[10.5px] text-muted-foreground">
                {dayTicks.map((d) => (
                    <span key={d}>Day {d}</span>
                ))}
            </div>
        </div>
    );
}

function YoYBars({
    labels,
    thisYear,
    lastYear,
}: {
    labels: string[];
    thisYear: number[];
    lastYear: number[];
}) {
    const w = 600;
    const h = 200;
    const p = 24;
    const max = Math.max(...thisYear, ...lastYear);
    const cw = (w - p * 2) / labels.length;
    const bw = (cw - 6) / 2;
    const sy = (v: number) => h - p - (v / max) * (h - p * 2);

    return (
        <svg
            viewBox={`0 0 ${w} ${h}`}
            width="100%"
            height={h}
            preserveAspectRatio="none"
            role="img"
            aria-label="Year-over-year monthly spend"
        >
            {[0, 1, 2, 3].map((i) => (
                <line
                    key={i}
                    x1={p}
                    x2={w - p}
                    y1={p + (i * (h - p * 2)) / 3}
                    y2={p + (i * (h - p * 2)) / 3}
                    stroke="var(--border)"
                    strokeDasharray="2 4"
                />
            ))}
            {labels.map((l, i) => {
                const cx = p + i * cw + 3;
                const yt = sy(thisYear[i]);
                const yl = sy(lastYear[i]);
                return (
                    <g key={l}>
                        <rect
                            x={cx}
                            y={yl}
                            width={bw}
                            height={h - p - yl}
                            fill="var(--muted-foreground)"
                            opacity={0.35}
                            rx={2}
                        />
                        <rect
                            x={cx + bw + 2}
                            y={yt}
                            width={bw}
                            height={h - p - yt}
                            fill="var(--warning)"
                            opacity={0.9}
                            rx={2}
                        />
                        <text
                            x={cx + bw + 1}
                            y={h - p + 12}
                            fontSize="9.5"
                            fill="var(--muted-foreground)"
                            textAnchor="middle"
                        >
                            {l}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

/* ============================================================
   SMALL PIECES
   ============================================================ */

function LegendItem({
    color,
    label,
    kind,
}: {
    color: string;
    label: string;
    kind: "solid" | "dashed" | "dotted";
}) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span
                className="inline-block h-px w-3.5"
                style={{
                    borderTopWidth: kind === "solid" ? 2 : 1.5,
                    borderTopStyle:
                        kind === "solid"
                            ? "solid"
                            : kind === "dashed"
                              ? "dashed"
                              : "dotted",
                    borderTopColor: color,
                }}
            />
            {label}
        </span>
    );
}

function VelocityRow({
    label,
    value,
    sub,
    muted = false,
    tone,
    unit,
    decimals = 2,
}: {
    label: string;
    value: number;
    sub: string;
    muted?: boolean;
    tone?: "expense";
    unit?: string;
    decimals?: number;
}) {
    return (
        <div className="flex flex-col gap-1 rounded-md bg-muted/30 px-3.5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {label}
            </span>
            {unit ? (
                <span
                    className={cn(
                        "text-xl font-bold tabular-nums",
                        tone === "expense" && "text-[color:var(--expense)]",
                        muted && "text-muted-foreground"
                    )}
                >
                    {value.toFixed(decimals)}
                    <span className="ml-0.5 text-base font-medium text-muted-foreground">
                        {unit}
                    </span>
                </span>
            ) : (
                <MoneyDisplay
                    amount={value}
                    variant={muted ? "muted" : "neutral"}
                    className="text-xl font-bold tabular-nums"
                />
            )}
            <span className="text-[10.5px] text-muted-foreground">{sub}</span>
        </div>
    );
}

function formatMoneyShort(n: number): string {
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
