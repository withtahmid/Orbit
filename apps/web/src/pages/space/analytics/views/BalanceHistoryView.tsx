import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Clock, Info, Wallet } from "lucide-react";
import { formatInAppTz } from "@/lib/formatDate";
import { formatMoney } from "@/lib/money";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip as RTooltip,
    XAxis,
    YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { PeriodChip } from "@/components/shared/PeriodChip";
import { KpiStrip, type KpiItem } from "@/components/shared/KpiStrip";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";
import {
    autoBucket,
    bucketLabelPattern,
    bucketTickPattern,
    BUCKET_LABEL,
    type Bucket,
    type BucketSelection,
} from "@/lib/chartBucket";

type TooltipValue = number | string | ReadonlyArray<number | string>;

function PerAccountTooltip({
    active,
    payload,
    label,
    bucket,
}: TooltipContentProps<TooltipValue, number | string> & { bucket: Bucket }) {
    if (!active || !payload || payload.length === 0) return null;
    const sorted = [...payload].sort(
        (a, b) => Number(b.value ?? 0) - Number(a.value ?? 0)
    );
    const total = sorted.reduce((sum, e) => sum + Number(e.value ?? 0), 0);
    return (
        <div className="min-w-[200px] rounded-lg border border-border bg-popover/95 p-3 shadow-lg backdrop-blur">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {formatInAppTz(label as string, bucketLabelPattern(bucket))}
            </div>
            <div className="mb-2 flex items-center gap-3 border-b border-border/60 pb-2 text-xs">
                <span className="flex-1 font-medium text-foreground">Total</span>
                <span className="font-mono font-semibold tabular-nums text-foreground">
                    {formatMoney(total)}
                </span>
            </div>
            <div className="space-y-1.5">
                {sorted.map((entry) => (
                    <div
                        key={entry.dataKey as string}
                        className="flex items-center gap-3 text-xs"
                    >
                        <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ background: entry.color }}
                        />
                        <span className="flex-1 truncate text-muted-foreground">
                            {entry.name}
                        </span>
                        <span className="font-mono tabular-nums text-foreground">
                            {formatMoney(Number(entry.value ?? 0))}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function BalanceHistoryView() {
    const { space } = useCurrentSpace();
    const { period } = usePeriod("last-3-months");

    // Accounts available to filter on. For a real space that's every
    // account in the space; for the virtual personal space it's every
    // account the caller owns.
    const accountsSpace = trpc.account.listBySpace.useQuery(
        { spaceId: space.id },
        { enabled: !space.isPersonal }
    );
    const accountsPersonal = trpc.personal.ownedAccounts.useQuery(undefined, {
        enabled: space.isPersonal,
    });
    const accounts = useMemo(() => {
        if (space.isPersonal) {
            return (accountsPersonal.data ?? []).map((a) => ({
                id: a.id,
                name: a.name,
                color: a.color,
                icon: a.icon,
            }));
        }
        return (accountsSpace.data ?? []).map((a) => ({
            id: a.id,
            name: a.name,
            color: a.color,
            icon: a.icon,
        }));
    }, [space.isPersonal, accountsSpace.data, accountsPersonal.data]);

    // Empty set = "all accounts" (no filter).
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const hasFilter = selected.size > 0;
    const accountIds = hasFilter ? Array.from(selected) : undefined;

    const [bucketSelection, setBucketSelection] =
        useState<BucketSelection>("auto");
    const resolvedBucket = useMemo(
        () => autoBucket(period.start, period.end),
        [period.start, period.end]
    );
    const effectiveBucket: Bucket =
        bucketSelection === "auto" ? resolvedBucket : bucketSelection;

    const [chartMode, setChartMode] = useState<"total" | "accounts">("total");

    const qSpace = trpc.analytics.balanceHistory.useQuery(
        {
            spaceId: space.id,
            periodStart: period.start,
            periodEnd: period.end,
            bucket: effectiveBucket,
            accountIds,
        },
        { enabled: !space.isPersonal }
    );
    const qPersonal = trpc.personal.balanceHistory.useQuery(
        {
            periodStart: period.start,
            periodEnd: period.end,
            bucket: effectiveBucket,
            accountIds,
        },
        { enabled: space.isPersonal }
    );
    const q = space.isPersonal ? qPersonal : qSpace;

    const chartAccounts = q.data?.accounts ?? [];
    const chartData = useMemo(() => {
        if (!q.data) return [];
        const byBucket = new Map<
            string,
            { bucket: string } & Record<string, number>
        >();
        for (const row of q.data.series) {
            const bucketKey =
                typeof row.bucket === "string"
                    ? row.bucket
                    : new Date(row.bucket).toISOString();
            let entry = byBucket.get(bucketKey);
            if (!entry) {
                entry = { bucket: bucketKey } as { bucket: string } & Record<
                    string,
                    number
                >;
                byBucket.set(bucketKey, entry);
            }
            entry[row.accountId] = row.balance;
        }
        return Array.from(byBucket.values()).sort((a, b) =>
            a.bucket.localeCompare(b.bucket)
        );
    }, [q.data]);

    const totalSeries = useMemo(() => {
        if (!q.data) return [];
        const byBucket = new Map<string, number>();
        for (const row of q.data.series) {
            const bucketKey =
                typeof row.bucket === "string"
                    ? row.bucket
                    : new Date(row.bucket).toISOString();
            byBucket.set(bucketKey, (byBucket.get(bucketKey) ?? 0) + row.balance);
        }
        return Array.from(byBucket.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([bucket, balance]) => ({ bucket, balance }));
    }, [q.data]);

    /**
     * Headline KPIs derived from the totals series. Peak / trough scan all
     * buckets; net-worth-today is the last bucket; period-change is last
     * minus first.
     */
    const kpi = useMemo(() => {
        if (totalSeries.length === 0) {
            return {
                today: 0,
                periodChange: 0,
                periodChangePctOfPeak: 0,
                peak: 0,
                peakAt: null as string | null,
                trough: 0,
                troughAt: null as string | null,
                weeksAgo: 0,
            };
        }
        const first = totalSeries[0];
        const last = totalSeries[totalSeries.length - 1];
        let peak = first.balance;
        let peakAt = first.bucket;
        let trough = first.balance;
        let troughAt = first.bucket;
        for (const r of totalSeries) {
            if (r.balance > peak) {
                peak = r.balance;
                peakAt = r.bucket;
            }
            if (r.balance < trough) {
                trough = r.balance;
                troughAt = r.bucket;
            }
        }
        const periodChange = last.balance - first.balance;
        const periodChangePctOfPeak =
            peak > 0 ? (periodChange / peak) * 100 : 0;
        // Weeks-ago: most periods bucket weekly so length-1 ≈ weeks-ago.
        const weeksAgo = totalSeries.length - 1;
        return {
            today: last.balance,
            periodChange,
            periodChangePctOfPeak,
            peak,
            peakAt,
            trough,
            troughAt,
            weeksAgo,
        };
    }, [totalSeries]);

    /** Bucket-unit name in singular/plural form, used to humanize KPI labels
     *  (e.g. "12-week change" instead of a generic "12-bucket change"). */
    const unitWord =
        effectiveBucket === "day"
            ? "day"
            : effectiveBucket === "week"
              ? "week"
              : effectiveBucket === "month"
                ? "month"
                : "year";

    const kpiItems: KpiItem[] = [
        {
            label: "Net worth today",
            value: kpi.today,
            money: true,
            tone: kpi.today >= 0 ? "income" : "expense",
        },
        {
            label: `${totalSeries.length}-${unitWord} change`,
            value: kpi.periodChange,
            money: true,
            tone: kpi.periodChange < 0 ? "expense" : "income",
            sub:
                kpi.peak > 0
                    ? `${kpi.periodChangePctOfPeak >= 0 ? "+" : ""}${kpi.periodChangePctOfPeak.toFixed(1)}% from peak`
                    : "—",
        },
        {
            label: "Peak balance",
            value: kpi.peak,
            money: true,
            sub: kpi.peakAt
                ? `${formatInAppTz(kpi.peakAt, "MMM d")} · ${formatUnitsAgo(
                      kpi.peakAt,
                      totalSeries,
                      unitWord
                  )}`
                : "—",
        },
        {
            label: "Trough balance",
            value: kpi.trough,
            money: true,
            sub: kpi.troughAt
                ? `${formatInAppTz(kpi.troughAt, "MMM d")} · ${formatUnitsAgo(
                      kpi.troughAt,
                      totalSeries,
                      unitWord
                  )}`
                : "—",
        },
    ];

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const triggerLabel = hasFilter
        ? selected.size === 1
            ? accounts.find((a) => selected.has(a.id))?.name ?? "1 account"
            : `${selected.size} accounts`
        : "All accounts";

    return (
        <AnalyticsDetailLayout
            title="Balance history"
            description="Balance per account over time. Assets shown positive, liabilities negative. Auto-bucketed weekly."
            actions={
                <div className="flex flex-wrap items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className="justify-between gap-2"
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    <Wallet className="size-3.5" />
                                    {triggerLabel}
                                </span>
                                <ChevronDown className="size-3.5 opacity-60" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                            <DropdownMenuLabel>Filter by account</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {accounts.length === 0 ? (
                                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                    No accounts available.
                                </p>
                            ) : (
                                <>
                                    <DropdownMenuItem
                                        onSelect={(e) => {
                                            e.preventDefault();
                                            setSelected(new Set());
                                        }}
                                        disabled={!hasFilter}
                                    >
                                        Clear selection
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <div className="max-h-[260px] overflow-y-auto">
                                        {accounts.map((a) => (
                                            <DropdownMenuCheckboxItem
                                                key={a.id}
                                                checked={selected.has(a.id)}
                                                onCheckedChange={() => toggle(a.id)}
                                                onSelect={(e) => e.preventDefault()}
                                            >
                                                <span className="flex min-w-0 items-center gap-2">
                                                    <EntityAvatar
                                                        size="sm"
                                                        color={a.color}
                                                        icon={a.icon}
                                                    />
                                                    <span className="truncate">
                                                        {a.name}
                                                    </span>
                                                </span>
                                            </DropdownMenuCheckboxItem>
                                        ))}
                                    </div>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Select
                        value={bucketSelection}
                        onValueChange={(v) =>
                            setBucketSelection(v as BucketSelection)
                        }
                    >
                        <SelectTrigger className="w-full min-w-[10rem] sm:w-auto">
                            <Clock className="size-4 text-muted-foreground" />
                            <SelectValue>
                                {bucketSelection === "auto"
                                    ? `Auto · ${BUCKET_LABEL[resolvedBucket]}`
                                    : BUCKET_LABEL[bucketSelection]}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="auto">Auto</SelectItem>
                            <SelectItem value="day">Day</SelectItem>
                            <SelectItem value="week">Week</SelectItem>
                            <SelectItem value="month">Month</SelectItem>
                            <SelectItem value="year">Year</SelectItem>
                        </SelectContent>
                    </Select>
                    <PeriodChip defaultPreset="last-3-months" />
                </div>
            }
        >
            <KpiStrip items={kpiItems} isLoading={q.isLoading} />

            <Tabs
                value={chartMode}
                onValueChange={(v) => setChartMode(v as "total" | "accounts")}
            >
                <TabsList>
                    <TabsTrigger value="total">Total</TabsTrigger>
                    <TabsTrigger value="accounts">By account</TabsTrigger>
                </TabsList>
            </Tabs>

            <Card>
                <CardHeader>
                    <CardTitle>
                        {chartMode === "total"
                            ? "Balance over the selected period"
                            : "Per-account breakdown"}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                        {chartMode === "total"
                            ? "Total spendable + assets, minus liabilities."
                            : "Each line is one account."}
                    </p>
                </CardHeader>
                {chartMode === "accounts" && chartAccounts.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-6 pb-3">
                        {chartAccounts.map((a) => {
                            const series = chartData.map(
                                (row) => Number(row[a.id] ?? 0)
                            );
                            const last = series[series.length - 1] ?? 0;
                            const first = series[0] ?? 0;
                            const delta = last - first;
                            return (
                                <div
                                    key={a.id}
                                    className="inline-flex items-center gap-1.5 text-[11px]"
                                >
                                    <span
                                        className="size-2 shrink-0 rounded-sm"
                                        style={{ background: a.color }}
                                    />
                                    <span className="text-foreground/85">
                                        {a.name}
                                    </span>
                                    <MoneyDisplay
                                        amount={last}
                                        variant="muted"
                                        className="text-[11px] font-medium"
                                    />
                                    <span
                                        className={
                                            delta >= 0
                                                ? "text-[color:var(--income)] tabular-nums"
                                                : "text-[color:var(--expense)] tabular-nums"
                                        }
                                    >
                                        {delta >= 0 ? "+" : ""}
                                        {(delta / 1000).toFixed(1)}k
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
                <CardContent className="h-[360px] px-1 sm:h-[440px] sm:px-4">
                    {q.isLoading ? (
                        <Skeleton className="h-full w-full" />
                    ) : chartMode === "total" ? (
                        totalSeries.length === 0 ? (
                            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                No balance data yet.
                            </p>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart
                                    data={totalSeries}
                                    margin={{
                                        top: 16,
                                        right: 16,
                                        bottom: 8,
                                        left: 0,
                                    }}
                                >
                                    <defs>
                                        {/* The design uses two distinct
                                            hues — a warm gold for the line
                                            and a cooler green for the area
                                            fill. Locking them to the same
                                            token reads as too monochrome
                                            and loses the editorial pop. */}
                                        <linearGradient
                                            id="balance-detail-total-grad"
                                            x1="0"
                                            y1="0"
                                            x2="0"
                                            y2="1"
                                        >
                                            <stop
                                                offset="0%"
                                                stopColor="oklch(60% 0.16 145)"
                                                stopOpacity={0.5}
                                            />
                                            <stop
                                                offset="100%"
                                                stopColor="oklch(60% 0.16 145)"
                                                stopOpacity={0}
                                            />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid
                                        strokeDasharray="2 6"
                                        stroke="var(--border)"
                                        vertical={false}
                                    />
                                    <XAxis
                                        dataKey="bucket"
                                        tickFormatter={(v) =>
                                            formatInAppTz(
                                                v,
                                                bucketTickPattern(effectiveBucket)
                                            )
                                        }
                                        stroke="var(--muted-foreground)"
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                    />
                                    {/* Y-axis hidden — design renders the
                                        balance line as a pure trend signal
                                        without numeric tick labels (the KPI
                                        strip carries the absolute numbers).
                                        Domain is tightened to [min×0.95,
                                        max×1.02] so the actual peak/trough
                                        variation reads — recharts' default
                                        anchors at zero, which compresses a
                                        91k→102k swing into a flat sliver. */}
                                    <YAxis
                                        hide
                                        domain={[
                                            (min: number) =>
                                                Math.floor(min * 0.95),
                                            (max: number) =>
                                                Math.ceil(max * 1.02),
                                        ]}
                                    />
                                    <RTooltip
                                        contentStyle={{
                                            background: "var(--popover)",
                                            border: "1px solid var(--border)",
                                            borderRadius: 8,
                                        }}
                                        labelFormatter={(v) =>
                                            formatInAppTz(
                                                v as string,
                                                bucketLabelPattern(effectiveBucket)
                                            )
                                        }
                                        formatter={(value) => [
                                            formatMoney(Number(value ?? 0)),
                                            "Balance",
                                        ]}
                                        cursor={{
                                            stroke: "var(--muted-foreground)",
                                            strokeOpacity: 0.3,
                                            strokeDasharray: "3 3",
                                        }}
                                    />
                                    <Area
                                        // Straight-line segments (not smooth
                                        // monotone curves) so peaks read as
                                        // sharp polyline angles like the
                                        // design's hand-rolled SVG.
                                        type="linear"
                                        dataKey="balance"
                                        // Warm gold stroke — separate from
                                        // the cool-green area gradient so
                                        // the line pops off the fill rather
                                        // than blending into it.
                                        stroke="oklch(82% 0.16 95)"
                                        // 1.6px matches the design's hand-
                                        // rolled SVG (`stroke-width="1.6"`).
                                        // Anything thicker reads as a
                                        // chunky line and changes the
                                        // chart's overall weight.
                                        strokeWidth={1.6}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        fill="url(#balance-detail-total-grad)"
                                        // Always show the dot at the latest
                                        // data point so the user's eye lands
                                        // on "where we are now"; mid-series
                                        // dots stay off to keep the line clean.
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        dot={((props: any) => {
                                            const cx = props?.cx as
                                                | number
                                                | undefined;
                                            const cy = props?.cy as
                                                | number
                                                | undefined;
                                            const index = props?.index as
                                                | number
                                                | undefined;
                                            const key = props?.key as
                                                | string
                                                | number
                                                | undefined;
                                            const isLast =
                                                index === totalSeries.length - 1;
                                            if (
                                                !isLast ||
                                                cx === undefined ||
                                                cy === undefined
                                            ) {
                                                // Recharts requires an SVG
                                                // element here even when we
                                                // don't want to render — an
                                                // invisible anchor with a
                                                // stable key prevents a React
                                                // null-key warning.
                                                return (
                                                    <circle
                                                        key={key ?? index}
                                                        r={0}
                                                        fill="none"
                                                    />
                                                );
                                            }
                                            // Two concentric circles: a soft
                                            // halo at 0.18 opacity behind a
                                            // solid 3.5px dot — mirrors the
                                            // design's "glow ring" around
                                            // the latest data point. Color
                                            // matches the line stroke so
                                            // the dot reads as the line's
                                            // terminus.
                                            return (
                                                <g key={key ?? index}>
                                                    <circle
                                                        cx={cx}
                                                        cy={cy}
                                                        r={7}
                                                        fill="oklch(82% 0.16 95)"
                                                        opacity={0.18}
                                                    />
                                                    <circle
                                                        cx={cx}
                                                        cy={cy}
                                                        r={3.5}
                                                        fill="oklch(82% 0.16 95)"
                                                    />
                                                </g>
                                            );
                                        }) as never}
                                        activeDot={{
                                            r: 4,
                                            strokeWidth: 2,
                                            stroke: "var(--background)",
                                        }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        )
                    ) : chartAccounts.length === 0 || chartData.length === 0 ? (
                        <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                            No balance data yet.
                        </p>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                                data={chartData}
                                margin={{ top: 16, right: 16, bottom: 8, left: 0 }}
                            >
                                <CartesianGrid
                                    strokeDasharray="2 6"
                                    stroke="var(--border)"
                                    vertical={false}
                                />
                                <XAxis
                                    dataKey="bucket"
                                    tickFormatter={(v) =>
                                        formatInAppTz(
                                            v,
                                            bucketTickPattern(effectiveBucket)
                                        )
                                    }
                                    stroke="var(--muted-foreground)"
                                    fontSize={11}
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                />
                                <YAxis
                                    hide
                                    domain={[
                                        (min: number) =>
                                            Math.floor(min * 0.95),
                                        (max: number) =>
                                            Math.ceil(max * 1.02),
                                    ]}
                                />
                                <RTooltip
                                    content={(props) => (
                                        <PerAccountTooltip
                                            {...props}
                                            bucket={effectiveBucket}
                                        />
                                    )}
                                    cursor={{
                                        stroke: "var(--muted-foreground)",
                                        strokeOpacity: 0.3,
                                        strokeDasharray: "3 3",
                                    }}
                                />
                                {chartAccounts.map((a) => (
                                    <Area
                                        key={a.id}
                                        type="linear"
                                        dataKey={a.id}
                                        name={a.name}
                                        stroke={a.color}
                                        // 1.6 matches the Total chart so the
                                        // two tabs feel like the same chart
                                        // family rather than two visually
                                        // distinct components.
                                        strokeWidth={1.6}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        fill="transparent"
                                        dot={false}
                                        activeDot={{
                                            r: 3.5,
                                            strokeWidth: 2,
                                            stroke: "var(--background)",
                                            fill: a.color,
                                        }}
                                    />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>

                {/* Annotations row — surfaces the peak / trough / period change
                    moments with their date so the user can read the chart's
                    story without scrubbing. Only shown on the Total tab; the
                    per-account view's legend already serves a similar role. */}
                {chartMode === "total" && totalSeries.length > 0 && !q.isLoading && (
                    <div className="grid gap-3 border-t border-border/40 px-6 py-4 sm:grid-cols-3">
                        <Annotation
                            icon="up"
                            color="var(--income)"
                            label={
                                kpi.peakAt
                                    ? `${formatInAppTz(kpi.peakAt, "MMM d")} — Peak`
                                    : "Peak"
                            }
                            value={formatMoney(kpi.peak)}
                        />
                        <Annotation
                            icon="down"
                            color="var(--expense)"
                            label={
                                kpi.troughAt
                                    ? `${formatInAppTz(kpi.troughAt, "MMM d")} — Trough`
                                    : "Trough"
                            }
                            value={formatMoney(kpi.trough)}
                        />
                        <Annotation
                            icon="info"
                            color="var(--warning)"
                            label={`Net change`}
                            value={`${kpi.periodChange >= 0 ? "+" : "−"}${formatMoney(
                                Math.abs(kpi.periodChange)
                            )}`}
                        />
                    </div>
                )}
            </Card>
        </AnalyticsDetailLayout>
    );
}

function Annotation({
    icon,
    color,
    label,
    value,
}: {
    icon: "up" | "down" | "info";
    color: string;
    label: string;
    value: string;
}) {
    const Icon = icon === "up" ? ArrowUp : icon === "down" ? ArrowDown : Info;
    return (
        <div className="flex items-start gap-2.5">
            <Icon className="size-3.5 shrink-0 translate-y-0.5" style={{ color }} />
            <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-muted-foreground">{label}</span>
                <span className="text-[12.5px] font-semibold tabular-nums text-foreground">
                    {value}
                </span>
            </div>
        </div>
    );
}

/**
 * Position a bucket relative to the latest one, e.g. "8 weeks ago".
 * The unit word follows the active bucket size so the result reads
 * naturally regardless of granularity.
 */
function formatUnitsAgo(
    bucketKey: string,
    series: Array<{ bucket: string }>,
    unitWord: string
): string {
    const idx = series.findIndex((r) => r.bucket === bucketKey);
    if (idx < 0) return "";
    const offsetFromLast = series.length - 1 - idx;
    if (offsetFromLast === 0) return "today";
    if (offsetFromLast === 1) return `1 ${unitWord} ago`;
    return `${offsetFromLast} ${unitWord}s ago`;
}
