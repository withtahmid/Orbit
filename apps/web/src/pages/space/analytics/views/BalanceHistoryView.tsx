import { useMemo, useState } from "react";
import { ChevronDown, Clock, Wallet } from "lucide-react";
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
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";
import {
    autoBucket,
    bucketLabelPattern,
    bucketTickPattern,
    BUCKET_LABEL,
    compactMoney,
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
    // account the caller owns (the scope the personal balance_history
    // already operates within — filtering to a non-owned account would
    // be silently dropped server-side anyway).
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

    // Empty set = "all accounts" (no filter). Using a Set here rather
    // than an array so toggle is O(1) and order-independent.
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const hasFilter = selected.size > 0;
    const accountIds = hasFilter ? Array.from(selected) : undefined;

    // Timeframe (bucket granularity). "auto" picks by period span.
    const [bucketSelection, setBucketSelection] =
        useState<BucketSelection>("auto");
    const resolvedBucket = useMemo(
        () => autoBucket(period.start, period.end),
        [period.start, period.end]
    );
    const effectiveBucket: Bucket =
        bucketSelection === "auto" ? resolvedBucket : bucketSelection;

    // Chart viewing mode. Default to "total" — most users want the net
    // trend at a glance; drilling into per-account is a conscious second
    // step, so we don't pay vertical space for it by default.
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

    // Pivot the server's long-form {accountId, bucket, balance} rows into
    // wide-form [{bucket, [accountId]: balance, ...}] which is what
    // Recharts wants when we emit one <Line> per account. Bucket values
    // come across the wire as ISO strings (no superjson transformer).
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

    // Totals series for the combined chart: sum every account's balance
    // within each bucket.
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
            description="Balance per account over time (assets positive, liabilities negative)."
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
                    <PeriodSelector defaultPreset="last-3-months" />
                </div>
            }
        >
            <Card>
                <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>
                        {chartMode === "total"
                            ? "Balance over the selected period"
                            : "Per-account breakdown"}
                    </CardTitle>
                    <Tabs
                        value={chartMode}
                        onValueChange={(v) =>
                            setChartMode(v as "total" | "accounts")
                        }
                    >
                        <TabsList>
                            <TabsTrigger value="total">Total</TabsTrigger>
                            <TabsTrigger value="accounts">By account</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </CardHeader>
                {chartMode === "accounts" && chartAccounts.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-6 pb-3">
                        {chartAccounts.map((a) => (
                            <div
                                key={a.id}
                                className="inline-flex items-center gap-1.5 text-xs"
                            >
                                <span
                                    className="size-2 shrink-0 rounded-full"
                                    style={{ background: a.color }}
                                />
                                <span className="text-muted-foreground">
                                    {a.name}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
                <CardContent className="h-[440px] px-1 sm:h-[540px] sm:px-4">
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
                                    margin={{ top: 16, right: 16, bottom: 8, left: 0 }}
                                >
                                    <defs>
                                        <linearGradient
                                            id="balance-detail-total-grad"
                                            x1="0"
                                            y1="0"
                                            x2="0"
                                            y2="1"
                                        >
                                            <stop
                                                offset="0%"
                                                stopColor="var(--primary)"
                                                stopOpacity={0.45}
                                            />
                                            <stop
                                                offset="100%"
                                                stopColor="var(--primary)"
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
                                        axisLine={{ stroke: "var(--border)" }}
                                        tickMargin={8}
                                    />
                                    <YAxis
                                        stroke="var(--muted-foreground)"
                                        fontSize={11}
                                        width={56}
                                        tickFormatter={compactMoney}
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={4}
                                    />
                                    <RTooltip
                                        contentStyle={{
                                            background: "var(--popover)",
                                            border: "1px solid var(--border)",
                                            borderRadius: 8,
                                        }}
                                        labelFormatter={(v) =>
                                            formatInAppTz(
                                                v as any,
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
                                        type="monotone"
                                        dataKey="balance"
                                        stroke="var(--primary)"
                                        strokeWidth={2.25}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        fill="url(#balance-detail-total-grad)"
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
                                <defs>
                                    {chartAccounts.map((a, i) => (
                                        <linearGradient
                                            key={a.id}
                                            id={`balance-acct-grad-${i}`}
                                            x1="0"
                                            y1="0"
                                            x2="0"
                                            y2="1"
                                        >
                                            <stop
                                                offset="0%"
                                                stopColor={a.color}
                                                stopOpacity={0.28}
                                            />
                                            <stop
                                                offset="100%"
                                                stopColor={a.color}
                                                stopOpacity={0}
                                            />
                                        </linearGradient>
                                    ))}
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
                                    axisLine={{ stroke: "var(--border)" }}
                                    tickMargin={8}
                                />
                                <YAxis
                                    stroke="var(--muted-foreground)"
                                    fontSize={11}
                                    width={56}
                                    tickFormatter={compactMoney}
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={4}
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
                                {chartAccounts.map((a, i) => (
                                    <Area
                                        key={a.id}
                                        type="monotone"
                                        dataKey={a.id}
                                        name={a.name}
                                        stroke={a.color}
                                        strokeWidth={2.25}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        fill={`url(#balance-acct-grad-${i})`}
                                        fillOpacity={1}
                                        dot={false}
                                        activeDot={{
                                            r: 4,
                                            strokeWidth: 2,
                                            stroke: "var(--background)",
                                        }}
                                    />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>
        </AnalyticsDetailLayout>
    );
}
