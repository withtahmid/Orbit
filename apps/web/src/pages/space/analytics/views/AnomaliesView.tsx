import { AlertTriangle, Check, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { KpiStrip, type KpiItem } from "@/components/shared/KpiStrip";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";
import { PeriodChip } from "@/components/shared/PeriodChip";
import { formatInAppTz } from "@/lib/formatDate";
import { cn } from "@/lib/utils";

export default function AnomaliesView() {
    const { space } = useCurrentSpace();
    const isPersonal = space.isPersonal;
    const { period } = usePeriod("this-month");

    const outliersSpaceQ = trpc.analytics.anomalies.outliers.useQuery(
        {
            spaceId: space.id,
            periodStart: period.start,
            periodEnd: period.end,
            sigma: 2,
            limit: 20,
        },
        { enabled: !isPersonal }
    );
    const outliersPersonalQ = trpc.personal.anomalies.outliers.useQuery(
        { periodStart: period.start, periodEnd: period.end, sigma: 2, limit: 20 },
        { enabled: isPersonal }
    );
    const outliers =
        (isPersonal ? outliersPersonalQ.data : outliersSpaceQ.data) ?? [];
    const outliersLoading = isPersonal
        ? outliersPersonalQ.isLoading
        : outliersSpaceQ.isLoading;

    const recurringSpaceQ = trpc.analytics.anomalies.recurring.useQuery(
        { spaceId: space.id },
        { enabled: !isPersonal }
    );
    const recurringPersonalQ = trpc.personal.anomalies.recurring.useQuery(
        {},
        { enabled: isPersonal }
    );
    const recurring =
        (isPersonal ? recurringPersonalQ.data : recurringSpaceQ.data) ?? [];
    const recurringLoading = isPersonal
        ? recurringPersonalQ.isLoading
        : recurringSpaceQ.isLoading;

    const patternsSpaceQ = trpc.analytics.anomalies.patternBreaks.useQuery(
        { spaceId: space.id },
        { enabled: !isPersonal }
    );
    const patternsPersonalQ = trpc.personal.anomalies.patternBreaks.useQuery(
        {},
        { enabled: isPersonal }
    );
    const patterns =
        (isPersonal ? patternsPersonalQ.data : patternsSpaceQ.data) ?? [];
    const patternsLoading = isPersonal
        ? patternsPersonalQ.isLoading
        : patternsSpaceQ.isLoading;

    const streaksSpaceQ = trpc.analytics.anomalies.streaks.useQuery(
        { spaceId: space.id, periodStart: period.start, periodEnd: period.end },
        { enabled: !isPersonal }
    );
    const streaksPersonalQ = trpc.personal.anomalies.streaks.useQuery(
        { periodStart: period.start, periodEnd: period.end },
        { enabled: isPersonal }
    );
    const streaks =
        (isPersonal ? streaksPersonalQ.data : streaksSpaceQ.data) ?? [];
    const streaksLoading = isPersonal
        ? streaksPersonalQ.isLoading
        : streaksSpaceQ.isLoading;

    const shapeSpaceQ = trpc.analytics.anomalies.shapeStats.useQuery(
        { spaceId: space.id, periodStart: period.start, periodEnd: period.end },
        { enabled: !isPersonal }
    );
    const shapePersonalQ = trpc.personal.anomalies.shapeStats.useQuery(
        { periodStart: period.start, periodEnd: period.end },
        { enabled: isPersonal }
    );
    const shape = (isPersonal ? shapePersonalQ.data : shapeSpaceQ.data) ?? null;
    const shapeLoading = isPersonal
        ? shapePersonalQ.isLoading
        : shapeSpaceQ.isLoading;

    const recurringIncreased = recurring.filter((r) => r.status === "increase");
    const recurringCancelled = recurring.filter((r) => r.status === "cancelled");
    const recurringDecreased = recurring.filter((r) => r.status === "decrease");

    const kpiItems: KpiItem[] = [
        {
            label: "Outlier transactions",
            value: outliers.length,
            valueFormat: "integer",
            tone: "expense",
            sub: "≥ 2σ above category avg",
        },
        {
            label: "Subscription changes",
            value: recurring.length,
            valueFormat: "integer",
            sub: `${recurringIncreased.length} ↑ · ${recurringDecreased.length} ↓ · ${recurringCancelled.length} cancelled`,
        },
        {
            label: "Broken patterns",
            value: patterns.length,
            valueFormat: "integer",
            sub: "Recurring charges that didn't fire",
        },
        {
            label: "Streaks tracked",
            value: streaks.length,
            valueFormat: "integer",
            sub: "see below",
        },
    ];

    return (
        <AnalyticsDetailLayout
            title="Anomalies & signals"
            description="Surprises in your spend — outlier transactions, recurring-charge changes, broken patterns, and streaks. Surfaced automatically."
            actions={<PeriodChip defaultPreset="this-month" />}
        >
            <KpiStrip
                items={kpiItems}
                isLoading={
                    outliersLoading ||
                    recurringLoading ||
                    patternsLoading ||
                    streaksLoading
                }
            />

            {/* Outlier transactions */}
            <Card className="overflow-hidden p-0">
                <div className="flex items-center justify-between gap-3 border-b border-border/40 px-6 py-4">
                    <div className="flex flex-col gap-0.5">
                        <CardTitle>Outlier transactions</CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Each is at least 2σ above the category's mean for the period.
                        </p>
                    </div>
                </div>
                {outliersLoading ? (
                    <div className="px-6 py-5">
                        <Skeleton className="h-32 w-full" />
                    </div>
                ) : outliers.length === 0 ? (
                    <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                        No outliers in this period.
                    </p>
                ) : (
                    <div className="flex flex-col">
                        {outliers.map((o, i) => (
                            <button
                                key={o.transactionId}
                                type="button"
                                className={cn(
                                    "grid items-center gap-3 px-6 py-3.5 text-left transition-colors hover:bg-accent/30",
                                    "grid-cols-[68px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(80px,auto)_72px_16px]",
                                    i > 0 && "border-t border-border/40"
                                )}
                            >
                                <span className="text-[11px] text-muted-foreground">
                                    {formatInAppTz(o.transactionDatetime, "MMM d")}
                                </span>
                                <span className="flex min-w-0 flex-col gap-0.5">
                                    <span className="truncate text-[13px] font-medium">
                                        {o.description ?? "—"}
                                    </span>
                                    <span className="truncate text-[10.5px] text-muted-foreground">
                                        {o.zScore.toFixed(1)}σ above category mean
                                    </span>
                                </span>
                                <span className="flex min-w-0 items-center gap-2">
                                    <span
                                        className="size-1.5 rounded-full"
                                        style={{
                                            backgroundColor:
                                                o.categoryColor ?? "#64748b",
                                        }}
                                    />
                                    <span className="truncate text-[12px] text-foreground/85">
                                        {o.categoryName ?? "Uncategorized"}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                        · avg ${o.categoryAverage.toFixed(0)}
                                    </span>
                                </span>
                                <MoneyDisplay
                                    amount={o.amount}
                                    variant="expense"
                                    className="text-right text-[13px] font-semibold"
                                />
                                <span className="inline-flex items-center justify-end gap-1 text-[11px] tabular-nums text-[color:var(--expense)]">
                                    <AlertTriangle className="size-3" />
                                    {o.zScore.toFixed(1)}σ
                                </span>
                                <ChevronRight className="size-3.5 text-muted-foreground/60" />
                            </button>
                        ))}
                    </div>
                )}
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
                        {recurringLoading ? (
                            <Skeleton className="h-24 w-full" />
                        ) : recurring.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No recurring-charge changes detected.
                            </p>
                        ) : (
                            recurring.slice(0, 6).map((r) => (
                                <div
                                    key={r.merchantKey + r.lastDate.toString()}
                                    className="grid items-center gap-3"
                                    style={{
                                        gridTemplateColumns:
                                            "32px minmax(0, 1fr) auto",
                                    }}
                                >
                                    <EntityAvatar
                                        size="sm"
                                        color="#64748b"
                                        icon="repeat"
                                    />
                                    <span className="flex min-w-0 flex-col gap-0.5">
                                        <span className="truncate text-[13px] font-medium">
                                            {r.merchant}
                                        </span>
                                        <span className="truncate text-[11px] text-muted-foreground">
                                            {formatInAppTz(r.lastDate, "MMM d")}
                                            {r.status === "cancelled"
                                                ? ` · last $${r.lastAmount.toFixed(2)} → ended`
                                                : r.prevAmount != null
                                                  ? ` · $${r.prevAmount.toFixed(
                                                        2
                                                    )} → $${r.lastAmount.toFixed(2)}`
                                                  : ""}
                                        </span>
                                    </span>
                                    <RecurringChip status={r.status} delta={r.deltaAmount} />
                                </div>
                            ))
                        )}

                        <div className="my-1 h-px bg-border/40" />

                        <div className="flex flex-col gap-0.5">
                            <CardTitle className="text-[14px]">
                                Pattern breaks
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">
                                Expected charges that haven't posted yet.
                            </p>
                        </div>
                        {patternsLoading ? (
                            <Skeleton className="h-16 w-full" />
                        ) : patterns.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Nothing overdue right now.
                            </p>
                        ) : (
                            patterns.slice(0, 6).map((p) => (
                                <div
                                    key={p.merchantKey + p.expectedDate.toString()}
                                    className="grid items-center gap-3"
                                    style={{
                                        gridTemplateColumns:
                                            "32px minmax(0, 1fr) auto",
                                    }}
                                >
                                    <EntityAvatar
                                        size="sm"
                                        color="#f59e0b"
                                        icon="repeat"
                                    />
                                    <span className="flex min-w-0 flex-col gap-0.5">
                                        <span className="truncate text-[13px] font-medium">
                                            {p.merchant}
                                        </span>
                                        <span className="truncate text-[11px] text-muted-foreground">
                                            Expected{" "}
                                            {formatInAppTz(p.expectedDate, "MMM d")}{" "}
                                            · {p.daysOverdue.toFixed(0)} days overdue
                                        </span>
                                    </span>
                                    <MoneyDisplay
                                        amount={p.expectedAmount}
                                        variant="muted"
                                        className="text-[12.5px] font-medium"
                                    />
                                </div>
                            ))
                        )}
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
                        {streaksLoading ? (
                            <Skeleton className="h-24 w-full" />
                        ) : streaks.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No streak data yet.
                            </p>
                        ) : (
                            streaks.map((s) => (
                                <div
                                    key={s.kind}
                                    className="grid items-center gap-3"
                                    style={{
                                        gridTemplateColumns:
                                            "32px minmax(0, 1fr) auto",
                                    }}
                                >
                                    <span
                                        className="grid size-8 place-items-center rounded-md"
                                        style={{
                                            background:
                                                "color-mix(in oklab, var(--income) 16%, transparent)",
                                            color: "var(--income)",
                                        }}
                                    >
                                        <Check className="size-3.5" />
                                    </span>
                                    <span className="flex min-w-0 flex-col gap-0.5">
                                        <span className="truncate text-[13px] font-medium">
                                            {s.label}
                                        </span>
                                        <span className="truncate text-[11px] text-muted-foreground">
                                            Best in window: {s.best} day
                                            {s.best === 1 ? "" : "s"}
                                        </span>
                                    </span>
                                    <span className="flex flex-col items-end leading-tight">
                                        <span className="text-[18px] font-semibold tabular-nums">
                                            {s.current}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">
                                            current run
                                        </span>
                                    </span>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Spending shape */}
            <Card>
                <CardHeader>
                    <CardTitle>Spending shape</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        A read on this period's pattern.
                    </p>
                </CardHeader>
                <CardContent>
                    {shapeLoading || !shape ? (
                        <Skeleton className="h-20 w-full" />
                    ) : (
                        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                            <ShapeCard
                                label="Frugal days"
                                value={`${shape.frugalDays} day${shape.frugalDays === 1 ? "" : "s"}`}
                                sub="≤ half the median day"
                                tone="income"
                            />
                            <ShapeCard
                                label="Heavy days"
                                value={`${shape.heavyDays} day${shape.heavyDays === 1 ? "" : "s"}`}
                                sub="≥ P95 day"
                                tone="expense"
                            />
                            <ShapeCard
                                label="Median day"
                                value={`$${shape.medianDay.toFixed(0)}`}
                                sub="Half of all days are below this"
                                tone="neutral"
                            />
                            <ShapeCard
                                label="P95 day"
                                value={`$${shape.p95Day.toFixed(0)}`}
                                sub="1-in-20 day spike"
                                tone="warning"
                            />
                        </div>
                    )}
                </CardContent>
            </Card>
        </AnalyticsDetailLayout>
    );
}

function RecurringChip({
    status,
    delta,
}: {
    status: "increase" | "decrease" | "cancelled";
    delta: number;
}) {
    if (status === "cancelled") {
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
    const tone = status === "increase" ? "expense" : "income";
    const sign = delta >= 0 ? "+" : "−";
    return (
        <span
            className="inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-medium tabular-nums tracking-wide"
            style={{
                color: `var(--${tone})`,
                borderColor: `color-mix(in oklab, var(--${tone}) 30%, transparent)`,
                background: `color-mix(in oklab, var(--${tone}) 10%, transparent)`,
            }}
        >
            {sign}${Math.abs(delta).toFixed(2)}
        </span>
    );
}

function ShapeCard({
    label,
    value,
    sub,
    tone,
}: {
    label: string;
    value: string;
    sub: string;
    tone: "income" | "expense" | "neutral" | "warning";
}) {
    return (
        <div className="flex flex-col gap-1 rounded-lg bg-muted/30 px-4 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {label}
            </span>
            <span
                className={cn(
                    "text-[22px] font-bold tabular-nums",
                    tone === "income" && "text-[color:var(--income)]",
                    tone === "expense" && "text-[color:var(--expense)]",
                    tone === "warning" && "text-[color:var(--warning)]",
                    tone === "neutral" && "text-foreground"
                )}
            >
                {value}
            </span>
            <span className="text-[11px] text-muted-foreground">{sub}</span>
        </div>
    );
}
