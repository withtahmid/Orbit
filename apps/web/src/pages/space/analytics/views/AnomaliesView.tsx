import {
    AlertTriangle,
    Check,
    ChevronRight,
    Coffee,
    Heart,
    Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { KpiStrip, type KpiItem } from "@/components/shared/KpiStrip";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { cn } from "@/lib/utils";

/* ============================================================
   DUMMY FIXTURES — backend doesn't surface anomaly detection yet.
   Numbers and copy mirror the design canvas for visual fidelity.
   ============================================================ */

type Outlier = {
    date: string;
    payee: string;
    note: string;
    category: string;
    categoryColor: string;
    avg: number;
    value: number;
    sigma: number;
};

const OUTLIERS: Outlier[] = [
    {
        date: "Apr 18",
        payee: "B&H Photo",
        note: "First purchase ever in this category",
        category: "Photography Gear",
        categoryColor: "#22d3ee",
        avg: 80,
        value: 1240,
        sigma: 12.4,
    },
    {
        date: "Apr 7",
        payee: "Singapore Airlines",
        note: "Annual trip — flagged as one-off",
        category: "Travel",
        categoryColor: "#a855f7",
        avg: 850,
        value: 2406,
        sigma: 3.1,
    },
    {
        date: "Mar 18",
        payee: "Apple Store",
        note: "Laptop purchase",
        category: "Tech & Gadgets",
        categoryColor: "#a855f7",
        avg: 110,
        value: 2406,
        sigma: 8.7,
    },
    {
        date: "Mar 22",
        payee: "Vetfirst Clinic",
        note: "Emergency visit",
        category: "Pet Care",
        categoryColor: "#3b82f6",
        avg: 60,
        value: 480,
        sigma: 4.2,
    },
];

type RecurringChange = {
    name: string;
    when: string;
    from: number;
    to: number;
    type: "increased" | "cancelled";
    color: string;
    icon: string;
};

const RECURRING: RecurringChange[] = [
    {
        name: "Spotify Family",
        when: "Apr 1",
        from: 16.99,
        to: 19.99,
        type: "increased",
        color: "#3b82f6",
        icon: "sparkle",
    },
    {
        name: "Notion Plus",
        when: "Mar 18",
        from: 10.0,
        to: 0,
        type: "cancelled",
        color: "#f59e0b",
        icon: "terminal",
    },
];

type PatternBreak = {
    name: string;
    expected: number;
    when: string;
    color: string;
    icon: string;
};

const PATTERN_BREAKS: PatternBreak[] = [
    {
        name: "Gym membership",
        expected: 49,
        when: "Apr 1 (expected)",
        color: "#10b981",
        icon: "flame",
    },
    {
        name: "Apple iCloud",
        expected: 9.99,
        when: "Apr 8 (expected)",
        color: "#f59e0b",
        icon: "repeat",
    },
    {
        name: "Spotify Family",
        expected: 19.99,
        when: "Apr 12 (delayed)",
        color: "#3b82f6",
        icon: "sparkle",
    },
];

type Streak = {
    label: string;
    value: number;
    unit: string;
    note: string;
    color: string;
    icon: LucideIcon;
};

const STREAKS: Streak[] = [
    {
        label: "No-spend days",
        value: 4,
        unit: "days in a row",
        note: "Best of the year so far",
        color: "var(--income)",
        icon: Check,
    },
    {
        label: "Coffee streak",
        value: 9,
        unit: "days in a row",
        note: "Tartine, every weekday morning",
        color: "#fb923c",
        icon: Coffee,
    },
    {
        label: "Under-budget",
        value: 3,
        unit: "months in a row",
        note: "Self Care envelope",
        color: "#3b82f6",
        icon: Heart,
    },
    {
        label: "Over-budget",
        value: 2,
        unit: "months in a row",
        note: "Hobbies envelope — consider raising the cap",
        color: "var(--expense)",
        icon: AlertTriangle,
    },
    {
        label: "Largest no-spend gap",
        value: 11,
        unit: "days (Mar 4–14)",
        note: "All-time record",
        color: "var(--warning)",
        icon: Sparkles,
    },
];

type ShapeStat = {
    label: string;
    value: string;
    sub: string;
    tone: "income" | "expense" | "neutral" | "warning";
};

const SHAPE_STATS: ShapeStat[] = [
    {
        label: "Frugal days",
        value: "12 days",
        sub: "Spent < $50",
        tone: "income",
    },
    {
        label: "Heavy days",
        value: "4 days",
        sub: "Spent > $200",
        tone: "expense",
    },
    {
        label: "Median day",
        value: "$48",
        sub: "Half of all days are below this",
        tone: "neutral",
    },
    {
        label: "P95 day",
        value: "$280",
        sub: "1-in-20 day spike",
        tone: "warning",
    },
];

/* ============================================================
   VIEW
   ============================================================ */

export default function AnomaliesView() {
    const kpiItems: KpiItem[] = [
        {
            label: "Outlier transactions",
            value: OUTLIERS.length,
            valueFormat: "integer",
            tone: "expense",
            sub: "≥ 2σ above category avg",
        },
        {
            label: "Subscription changes",
            value: RECURRING.length,
            valueFormat: "integer",
            sub: `${RECURRING.filter((r) => r.type === "increased").length} increase · ${
                RECURRING.filter((r) => r.type === "cancelled").length
            } cancelled`,
        },
        {
            label: "Broken patterns",
            value: PATTERN_BREAKS.length,
            valueFormat: "integer",
            sub: "Recurring charges that didn't fire",
        },
        {
            label: "Active streaks",
            value: STREAKS.length,
            valueFormat: "integer",
            sub: "see below",
        },
    ];

    return (
        <AnalyticsDetailLayout
            title="Anomalies & signals"
            description="Surprises in your spend — outlier transactions, recurring-charge changes, broken patterns, and streaks. Surfaced automatically; click any to investigate."
        >
            <KpiStrip items={kpiItems} />

            {/* Outlier transactions */}
            <Card className="overflow-hidden p-0">
                <div className="flex items-center justify-between gap-3 border-b border-border/40 px-6 py-4">
                    <div className="flex flex-col gap-0.5">
                        <CardTitle>Outlier transactions</CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Each is at least 2× the category's monthly average.
                        </p>
                    </div>
                    <Button size="sm" variant="outline">
                        Mute category
                    </Button>
                </div>
                <div className="flex flex-col">
                    {OUTLIERS.map((o, i) => (
                        <button
                            key={i}
                            type="button"
                            className={cn(
                                "grid items-center gap-3 px-6 py-3.5 text-left transition-colors hover:bg-accent/30",
                                "grid-cols-[68px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(80px,auto)_72px_16px]",
                                i > 0 && "border-t border-border/40"
                            )}
                        >
                            <span className="text-[11px] text-muted-foreground">
                                {o.date}
                            </span>
                            <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="truncate text-[13px] font-medium">
                                    {o.payee}
                                </span>
                                <span className="truncate text-[10.5px] text-muted-foreground">
                                    {o.note}
                                </span>
                            </span>
                            <span className="flex min-w-0 items-center gap-2">
                                <span
                                    className="size-1.5 rounded-full"
                                    style={{
                                        backgroundColor: o.categoryColor,
                                    }}
                                />
                                <span className="truncate text-[12px] text-foreground/85">
                                    {o.category}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                    · avg ${o.avg}
                                </span>
                            </span>
                            <MoneyDisplay
                                amount={o.value}
                                variant="expense"
                                className="text-right text-[13px] font-semibold"
                            />
                            <span className="inline-flex items-center justify-end gap-1 text-[11px] tabular-nums text-[color:var(--expense)]">
                                <AlertTriangle className="size-3" />
                                {o.sigma.toFixed(1)}σ
                            </span>
                            <ChevronRight className="size-3.5 text-muted-foreground/60" />
                        </button>
                    ))}
                </div>
            </Card>

            <div className="grid gap-3.5 lg:grid-cols-2">
                {/* Recurring charges + Pattern breaks */}
                <Card>
                    <CardHeader>
                        <CardTitle>Recurring charges</CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Subscriptions whose price or cadence changed.
                        </p>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        {RECURRING.map((r) => (
                            <div
                                key={r.name}
                                className="grid items-center gap-3"
                                style={{
                                    gridTemplateColumns: "32px minmax(0, 1fr) auto",
                                }}
                            >
                                <EntityAvatar
                                    size="sm"
                                    color={r.color}
                                    icon={r.icon}
                                />
                                <span className="flex min-w-0 flex-col gap-0.5">
                                    <span className="truncate text-[13px] font-medium">
                                        {r.name}
                                    </span>
                                    <span className="truncate text-[11px] text-muted-foreground">
                                        {r.when} · ${r.from.toFixed(2)}/mo{" "}
                                        {r.type === "cancelled"
                                            ? "→ ended"
                                            : `→ $${r.to.toFixed(2)}/mo`}
                                    </span>
                                </span>
                                <ChangeChip change={r} />
                            </div>
                        ))}

                        <div className="my-1 h-px bg-border/40" />

                        <div className="flex flex-col gap-0.5">
                            <CardTitle className="text-[14px]">
                                Pattern breaks
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">
                                Expected charges that didn't post.
                            </p>
                        </div>
                        {PATTERN_BREAKS.map((p) => (
                            <div
                                key={p.name + p.when}
                                className="grid items-center gap-3"
                                style={{
                                    gridTemplateColumns: "32px minmax(0, 1fr) auto",
                                }}
                            >
                                <EntityAvatar
                                    size="sm"
                                    color={p.color}
                                    icon={p.icon}
                                />
                                <span className="flex min-w-0 flex-col gap-0.5">
                                    <span className="truncate text-[13px] font-medium">
                                        {p.name}
                                    </span>
                                    <span className="truncate text-[11px] text-muted-foreground">
                                        {p.when}
                                    </span>
                                </span>
                                <MoneyDisplay
                                    amount={p.expected}
                                    variant="muted"
                                    className="text-[12.5px] font-medium"
                                />
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Streaks */}
                <Card>
                    <CardHeader>
                        <CardTitle>Streaks</CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Patterns that build over time.
                        </p>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        {STREAKS.map((s) => {
                            const Icon = s.icon;
                            return (
                                <div
                                    key={s.label}
                                    className="grid items-center gap-3"
                                    style={{
                                        gridTemplateColumns:
                                            "32px minmax(0, 1fr) auto",
                                    }}
                                >
                                    <span
                                        className="grid size-8 place-items-center rounded-md"
                                        style={{
                                            background: `color-mix(in oklab, ${s.color} 16%, transparent)`,
                                            color: s.color,
                                        }}
                                    >
                                        <Icon className="size-3.5" />
                                    </span>
                                    <span className="flex min-w-0 flex-col gap-0.5">
                                        <span className="truncate text-[13px] font-medium">
                                            {s.label}
                                        </span>
                                        <span className="truncate text-[11px] text-muted-foreground">
                                            {s.note}
                                        </span>
                                    </span>
                                    <span className="flex flex-col items-end leading-tight">
                                        <span className="text-[18px] font-semibold tabular-nums">
                                            {s.value}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">
                                            {s.unit}
                                        </span>
                                    </span>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            </div>

            {/* Spending shape */}
            <Card>
                <CardHeader>
                    <CardTitle>Spending shape</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        A read on this month's pattern.
                    </p>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                        {SHAPE_STATS.map((s) => (
                            <div
                                key={s.label}
                                className="flex flex-col gap-1 rounded-lg bg-muted/30 px-4 py-3"
                            >
                                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                    {s.label}
                                </span>
                                <span
                                    className={cn(
                                        "text-[22px] font-bold tabular-nums",
                                        s.tone === "income" &&
                                            "text-[color:var(--income)]",
                                        s.tone === "expense" &&
                                            "text-[color:var(--expense)]",
                                        s.tone === "warning" &&
                                            "text-[color:var(--warning)]",
                                        s.tone === "neutral" && "text-foreground"
                                    )}
                                >
                                    {s.value}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                    {s.sub}
                                </span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

        </AnalyticsDetailLayout>
    );
}

function ChangeChip({ change }: { change: RecurringChange }) {
    if (change.type === "cancelled") {
        return (
            <span
                className="inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-medium tracking-wide"
                style={{
                    color: "var(--income)",
                    borderColor:
                        "color-mix(in oklab, var(--income) 30%, transparent)",
                    background:
                        "color-mix(in oklab, var(--income) 10%, transparent)",
                }}
            >
                Cancelled
            </span>
        );
    }
    const delta = change.to - change.from;
    return (
        <span
            className="inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-medium tabular-nums tracking-wide"
            style={{
                color: "var(--expense)",
                borderColor:
                    "color-mix(in oklab, var(--expense) 30%, transparent)",
                background:
                    "color-mix(in oklab, var(--expense) 10%, transparent)",
            }}
        >
            +${delta.toFixed(2)}
        </span>
    );
}
