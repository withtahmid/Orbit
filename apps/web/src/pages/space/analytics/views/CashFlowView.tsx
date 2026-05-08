import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
    Bar,
    CartesianGrid,
    ComposedChart,
    LabelList,
    Line,
    ResponsiveContainer,
    Tooltip as RTooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { PeriodChip } from "@/components/shared/PeriodChip";
import { MetricToggle, useMetricMode } from "@/components/shared/MetricMode";
import { KpiStrip, type KpiItem } from "@/components/shared/KpiStrip";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";
import { ROUTES } from "@/router/routes";
import { formatInAppTz } from "@/lib/formatDate";
import { formatMoney } from "@/lib/money";

type Row = {
    bucket: Date | string;
    income: number;
    expense: number;
    net: number;
};

export default function CashFlowView() {
    const { space } = useCurrentSpace();
    const navigate = useNavigate();
    const { period } = usePeriod("last-6-months");
    const { mode } = useMetricMode();

    const qSpace = trpc.analytics.cashFlow.useQuery(
        {
            spaceId: space.id,
            periodStart: period.start,
            periodEnd: period.end,
            bucket: "month",
            mode,
        },
        { enabled: !space.isPersonal }
    );
    const qPersonal = trpc.personal.cashFlow.useQuery(
        {
            periodStart: period.start,
            periodEnd: period.end,
            bucket: "month",
            mode,
        },
        { enabled: space.isPersonal }
    );
    const q = space.isPersonal ? qPersonal : qSpace;

    /* Per-month top expense category — one leader per bucket so each
       row of the breakdown table can show its own month's winner. */
    const topByBucketSpaceQ = trpc.analytics.topCategoriesByBucket.useQuery(
        {
            spaceId: space.id,
            periodStart: period.start,
            periodEnd: period.end,
            bucket: "month",
        },
        { enabled: !space.isPersonal }
    );
    const topByBucketPersonalQ = trpc.personal.topCategoriesByBucket.useQuery(
        {
            periodStart: period.start,
            periodEnd: period.end,
            bucket: "month",
        },
        { enabled: space.isPersonal }
    );
    /* Bucket lookup keyed by app-timezone yyyy-MM. `toISOString` would
       return UTC year-month, which is off by a month for any BST bucket
       at the period edge (April BST starts at 18:00 UTC on March 31).
       Both producer and consumer must use the same key derivation. */
    const topByBucket = useMemo(() => {
        const data =
            (space.isPersonal
                ? topByBucketPersonalQ.data
                : topByBucketSpaceQ.data) ?? [];
        const m = new Map<
            string,
            { categoryId: string; name: string; color: string; icon: string; total: number } | null
        >();
        for (const r of data) {
            const key = formatInAppTz(r.bucket, "yyyy-MM");
            m.set(key, r.top);
        }
        return m;
    }, [space.isPersonal, topByBucketSpaceQ.data, topByBucketPersonalQ.data]);
    const topForBucket = (b: Date | string) => {
        const dt = b instanceof Date ? b : new Date(b);
        return topByBucket.get(formatInAppTz(dt, "yyyy-MM")) ?? null;
    };

    const rows = useMemo<Row[]>(() => (q.data ?? []) as Row[], [q.data]);

    const summary = useMemo(() => {
        const income = rows.reduce((acc, r) => acc + Number(r.income ?? 0), 0);
        const expense = rows.reduce((acc, r) => acc + Number(r.expense ?? 0), 0);
        const net = income - expense;
        const monthCount = rows.filter(
            (r) => Number(r.income) > 0 || Number(r.expense) > 0
        ).length;
        const avgIncome = monthCount > 0 ? income / monthCount : 0;
        const savingsRate = income > 0 ? (net / income) * 100 : 0;
        return { income, expense, net, monthCount, avgIncome, savingsRate };
    }, [rows]);

    const chartData = useMemo(
        () =>
            rows.map((r) => {
                const income = Number(r.income);
                const expense = Number(r.expense);
                const net = income - expense;
                const rate = income > 0 ? (net / income) * 100 : 0;
                // Overage label sits above the expense bar only when the
                // month was a drawdown — communicates "spent X over income"
                // at a glance. `null` (not 0) so recharts skips the label
                // entirely on positive-net months.
                const overage = expense > income ? -(expense - income) : null;
                return {
                    bucket: r.bucket,
                    income,
                    expense,
                    net,
                    rate,
                    overage,
                };
            }),
        [rows]
    );

    /* Labels swap based on metric mode so the user always knows
       which definition they're reading.
         - cash       → "Inflow / Outflow / Net cash" (incl. transfers)
         - operational → "Income / Expense / Net" (true earnings/spend) */
    const inLabel = mode === "cash" ? "Inflow" : "Income";
    const outLabel = mode === "cash" ? "Outflow" : "Expense";
    const netLabel = mode === "cash" ? "Net cash" : "Net";
    const modeNote =
        mode === "cash"
            ? "incl. cross-space transfers"
            : "transfer principal excluded";

    const kpiItems: KpiItem[] = [
        {
            label: inLabel,
            value: summary.income,
            tone: "income",
            money: true,
            sub:
                summary.monthCount > 0
                    ? `${summary.monthCount}-month total · monthly avg ${formatMoney(
                          summary.avgIncome
                      )}`
                    : "—",
        },
        {
            label: outLabel,
            value: summary.expense,
            tone: "expense",
            money: true,
            sub:
                summary.expense > summary.income
                    ? "Spending outpaced earning"
                    : "Within reach of earning",
        },
        {
            label: netLabel,
            value: summary.net,
            tone: summary.net < 0 ? "expense" : "income",
            money: true,
            sub: summary.net >= 0 ? "Saving consistently" : "Drawdown",
        },
        {
            label: mode === "cash" ? "Savings rate" : "Operational rate",
            value: summary.savingsRate,
            valueFormat: "percent",
            tone: summary.savingsRate < 0 ? "expense" : "neutral",
            sub: `% retained · ${modeNote}`,
        },
    ];

    const isEmpty = !q.isLoading && rows.length === 0;

    return (
        <AnalyticsDetailLayout
            title="Cash flow"
            description={
                mode === "cash"
                    ? "Money in versus money out, month by month — includes cross-space transfer principal. Switch to Operational for the true income vs expense view."
                    : "True income versus expense, month by month — transfer principal excluded. Switch to Cash for the bank-balance view that includes cross-space transfers."
            }
            actions={
                <div className="flex flex-wrap items-center gap-2">
                    <MetricToggle />
                    <PeriodChip defaultPreset="last-6-months" />
                </div>
            }
        >
            <KpiStrip items={kpiItems} isLoading={q.isLoading} />

            <Card>
                <CardHeader className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle>
                            Monthly {inLabel.toLowerCase()} vs{" "}
                            {outLabel.toLowerCase()}
                        </CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Bars are paired; the dotted line plots the
                            {mode === "cash" ? " savings" : " operational"} rate
                            (right axis).
                        </p>
                    </div>
                    <ChartLegend inLabel={inLabel} outLabel={outLabel} />
                </CardHeader>
                <CardContent className="h-[320px] px-1 sm:h-[380px] sm:px-6">
                    {q.isLoading ? (
                        <Skeleton className="h-full w-full" />
                    ) : isEmpty ? (
                        <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                            No cash flow data in this period.
                        </p>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                                data={chartData}
                                margin={{ top: 16, right: 24, left: 0, bottom: 0 }}
                                barGap={2}
                                barCategoryGap="22%"
                            >
                                <CartesianGrid
                                    vertical={false}
                                    strokeDasharray="2 4"
                                    stroke="var(--border)"
                                />
                                <XAxis
                                    dataKey="bucket"
                                    tickFormatter={(v) => formatInAppTz(v, "MMM")}
                                    stroke="var(--muted-foreground)"
                                    tickLine={false}
                                    axisLine={false}
                                    fontSize={11}
                                />
                                <YAxis
                                    yAxisId="left"
                                    stroke="var(--muted-foreground)"
                                    tickLine={false}
                                    axisLine={false}
                                    fontSize={11}
                                    width={48}
                                    tickFormatter={(v) =>
                                        v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${v}`
                                    }
                                />
                                {/* Hidden right axis — drives the savings-rate
                                    line's scaling, but the design renders
                                    the line as a pure trend signal without
                                    numeric tick labels. */}
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    hide
                                />
                                <RTooltip
                                    cursor={{ fill: "var(--accent)", opacity: 0.4 }}
                                    content={({ active, payload, label }) => {
                                        if (!active || !payload?.length) return null;
                                        const d = payload[0].payload as
                                            | (typeof chartData)[number]
                                            | undefined;
                                        if (!d) return null;
                                        return (
                                            <div className="rounded-md border border-border bg-popover p-2.5 text-xs shadow-lg">
                                                <p className="mb-1.5 font-medium">
                                                    {formatInAppTz(label as never, "MMMM yyyy")}
                                                </p>
                                                <div className="flex flex-col gap-1 tabular-nums">
                                                    <Row
                                                        dot="var(--income)"
                                                        label={inLabel}
                                                        value={d.income}
                                                        tone="income"
                                                    />
                                                    <Row
                                                        dot="var(--expense)"
                                                        label={outLabel}
                                                        value={d.expense}
                                                        tone="expense"
                                                    />
                                                    <div className="my-0.5 h-px bg-border/60" />
                                                    <Row
                                                        dot="var(--muted-foreground)"
                                                        label={netLabel}
                                                        value={d.net}
                                                        signed
                                                    />
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {mode === "cash"
                                                            ? "Savings"
                                                            : "Operational"}{" "}
                                                        rate {d.rate.toFixed(1)}%
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    }}
                                />
                                <Bar
                                    yAxisId="left"
                                    dataKey="income"
                                    fill="var(--income)"
                                    radius={[4, 4, 0, 0]}
                                    barSize={32}
                                />
                                <Bar
                                    yAxisId="left"
                                    dataKey="expense"
                                    fill="var(--expense)"
                                    radius={[4, 4, 0, 0]}
                                    barSize={32}
                                >
                                    <LabelList
                                        dataKey="overage"
                                        position="top"
                                        formatter={(v) =>
                                            typeof v === "number"
                                                ? formatOverage(v)
                                                : ""
                                        }
                                        fill="var(--expense)"
                                        fontSize={10}
                                        fontWeight={600}
                                    />
                                </Bar>
                                <Line
                                    yAxisId="right"
                                    dataKey="rate"
                                    type="monotone"
                                    stroke="var(--warning)"
                                    strokeWidth={1.5}
                                    strokeDasharray="3 3"
                                    dot={{
                                        r: 3,
                                        fill: "var(--warning)",
                                        stroke: "var(--warning)",
                                    }}
                                    activeDot={{ r: 4 }}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            <Card className="overflow-hidden p-0">
                <div className="flex flex-col gap-0.5 px-6 pt-5 pb-3">
                    <CardTitle>Per-month breakdown</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Click any month to drill into transactions.
                    </p>
                </div>
                {q.isLoading ? (
                    <div className="px-6 pb-5">
                        <Skeleton className="h-40 w-full" />
                    </div>
                ) : isEmpty ? (
                    <p className="px-6 pb-5 text-sm text-muted-foreground">
                        No months in this period.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="bg-muted/40">
                                    {[
                                        { label: "Month", align: "left" },
                                        { label: inLabel, align: "right" },
                                        { label: outLabel, align: "right" },
                                        { label: netLabel, align: "right" },
                                        { label: "Rate", align: "right" },
                                        {
                                            label: "Top expense category",
                                            align: "left",
                                        },
                                    ].map((h) => (
                                        <th
                                            key={h.label}
                                            className={`px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground ${
                                                h.align === "right"
                                                    ? "text-right"
                                                    : "text-left"
                                            }`}
                                        >
                                            {h.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {chartData.map((d, i) => (
                                    <tr
                                        key={i}
                                        onClick={() => {
                                            const start =
                                                d.bucket instanceof Date
                                                    ? d.bucket
                                                    : new Date(d.bucket);
                                            const from = ymd(startOfMonth(start));
                                            const to = ymd(
                                                new Date(
                                                    nextMonth(start).getTime() - 1
                                                )
                                            );
                                            navigate(
                                                `${ROUTES.spaceTransactions(
                                                    space.id
                                                )}?period=custom&from=${from}&to=${to}`
                                            );
                                        }}
                                        className="cursor-pointer border-t border-border/60 transition-colors hover:bg-accent/30"
                                    >
                                        <td className="px-5 py-3 text-foreground">
                                            {formatInAppTz(d.bucket, "MMM yyyy")}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <MoneyDisplay
                                                amount={d.income}
                                                variant="income"
                                            />
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <MoneyDisplay
                                                amount={d.expense}
                                                variant="expense"
                                            />
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <MoneyDisplay
                                                amount={d.net}
                                                variant={
                                                    d.net >= 0 ? "income" : "expense"
                                                }
                                                signed
                                            />
                                        </td>
                                        <td
                                            className={`px-5 py-3 text-right tabular-nums ${
                                                d.rate >= 0
                                                    ? "text-[color:var(--income)]"
                                                    : "text-[color:var(--expense)]"
                                            }`}
                                        >
                                            {d.rate >= 0 ? "+" : ""}
                                            {d.rate.toFixed(1)}%
                                        </td>
                                        <td className="px-5 py-3 text-left">
                                            {(() => {
                                                const top = topForBucket(d.bucket);
                                                if (!top)
                                                    return (
                                                        <span className="text-muted-foreground">
                                                            —
                                                        </span>
                                                    );
                                                return (
                                                    <span className="inline-flex items-center gap-2 text-foreground/85">
                                                        <span
                                                            className="size-1.5 rounded-full"
                                                            style={{
                                                                backgroundColor:
                                                                    top.color,
                                                            }}
                                                        />
                                                        <span className="truncate">
                                                            {top.name}
                                                        </span>
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </AnalyticsDetailLayout>
    );
}

function ChartLegend({
    inLabel,
    outLabel,
}: {
    inLabel: string;
    outLabel: string;
}) {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
                <span
                    className="size-2.5 rounded-sm"
                    style={{ backgroundColor: "var(--income)" }}
                />
                <ArrowUp className="size-3 text-[color:var(--income)]" />
                {inLabel}
            </span>
            <span className="inline-flex items-center gap-1.5">
                <span
                    className="size-2.5 rounded-sm"
                    style={{ backgroundColor: "var(--expense)" }}
                />
                <ArrowDown className="size-3 text-[color:var(--expense)]" />
                {outLabel}
            </span>
            <span className="inline-flex items-center gap-1.5">
                <span
                    className="inline-block h-px w-3.5 border-t border-dashed"
                    style={{ borderColor: "var(--warning)" }}
                />
                Rate
            </span>
        </div>
    );
}

function Row({
    dot,
    label,
    value,
    signed,
    tone,
}: {
    dot: string;
    label: string;
    value: number;
    signed?: boolean;
    /** Override variant for inflow/outflow rows where the label is
     *  user-facing copy (Inflow / Outflow / Income / Expense) and we
     *  shouldn't infer color from the string. Net falls through to
     *  sign-based inference. */
    tone?: "income" | "expense";
}) {
    const inferred: "income" | "expense" =
        tone ?? (value < 0 ? "expense" : "income");
    return (
        <div className="flex items-center justify-between gap-6">
            <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-sm" style={{ backgroundColor: dot }} />
                {label}
            </span>
            <MoneyDisplay amount={value} variant={inferred} signed={signed} />
        </div>
    );
}

/* Re-export the BST-aware helpers so the navigation URLs we build for
   month-row drilldowns use the same wall-clock boundaries the server
   queries against, not the user's browser tz. */
import {
    startOfMonth as startOfMonthAppTz,
    addMonths as addMonthsAppTz,
} from "@/lib/dates";
import { toInputDate } from "@/lib/dates";

function startOfMonth(d: Date): Date {
    return startOfMonthAppTz(d);
}

function nextMonth(d: Date): Date {
    return addMonthsAppTz(startOfMonthAppTz(d), 1);
}

function ymd(d: Date): string {
    return toInputDate(d);
}

/**
 * Compact formatter for the bar-overage label. Negative values render
 * with a leading minus and `k` suffix at one decimal — matches the
 * design's `−1.2k` / `−3.0k` styling.
 */
function formatOverage(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1000) return `−${(abs / 1000).toFixed(1)}k`;
    return `−${Math.round(abs)}`;
}
