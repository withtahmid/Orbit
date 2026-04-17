import { useMemo } from "react";
import { format } from "date-fns";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip as RTooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { Progress } from "@/components/ui/progress";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";
import { startOfYear, endOfYear, startOfMonth } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { colorForId } from "@/lib/entityStyle";

export default function AnalyticsPage() {
    const { period } = usePeriod("last-3-months");

    return (
        <div className="grid gap-5 sm:gap-6">
            <PageHeader
                title="Analytics"
                description="Deep insights into your space"
                actions={<PeriodSelector defaultPreset="last-3-months" />}
            />

            <Tabs defaultValue="cashflow">
                <TabsList className="flex flex-wrap h-auto">
                    <TabsTrigger value="cashflow">Cash flow</TabsTrigger>
                    <TabsTrigger value="categories">Categories</TabsTrigger>
                    <TabsTrigger value="envelopes">Envelopes</TabsTrigger>
                    <TabsTrigger value="balance">Balance history</TabsTrigger>
                    <TabsTrigger value="accounts">Accounts</TabsTrigger>
                    <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
                </TabsList>

                <TabsContent value="cashflow" className="mt-4">
                    <CashFlowTab periodStart={period.start} periodEnd={period.end} />
                </TabsContent>
                <TabsContent value="categories" className="mt-4">
                    <CategoriesTab periodStart={period.start} periodEnd={period.end} />
                </TabsContent>
                <TabsContent value="envelopes" className="mt-4">
                    <EnvelopesTab periodStart={period.start} periodEnd={period.end} />
                </TabsContent>
                <TabsContent value="balance" className="mt-4">
                    <BalanceTab periodStart={period.start} periodEnd={period.end} />
                </TabsContent>
                <TabsContent value="accounts" className="mt-4">
                    <AccountsDistTab />
                </TabsContent>
                <TabsContent value="heatmap" className="mt-4">
                    <HeatmapTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function CashFlowTab({ periodStart, periodEnd }: { periodStart: Date; periodEnd: Date }) {
    const { space } = useCurrentSpace();
    const q = trpc.analytics.cashFlow.useQuery({
        spaceId: space.id,
        periodStart,
        periodEnd,
        bucket: "month",
    });
    return (
        <Card>
            <CardHeader>
                <CardTitle>Income vs expense</CardTitle>
                <CardDescription>Monthly net cash movement</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] px-1 sm:h-[360px] sm:px-6">
                {q.isLoading ? (
                    <Skeleton className="h-full w-full" />
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={q.data ?? []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis
                                dataKey="bucket"
                                tickFormatter={(v) => format(new Date(v), "MMM")}
                                stroke="var(--muted-foreground)"
                                fontSize={11}
                            />
                            <YAxis stroke="var(--muted-foreground)" fontSize={11} width={50} />
                            <RTooltip
                                contentStyle={{
                                    background: "var(--popover)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 8,
                                }}
                                labelFormatter={(v) =>
                                    format(new Date(v as any), "MMMM yyyy")
                                }
                            />
                            <Bar dataKey="income" fill="var(--income)" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="expense" fill="var(--expense)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}

function CategoriesTab({
    periodStart,
    periodEnd,
}: {
    periodStart: Date;
    periodEnd: Date;
}) {
    const { space } = useCurrentSpace();
    const breakdown = trpc.analytics.categoryBreakdown.useQuery({
        spaceId: space.id,
        periodStart,
        periodEnd,
    });
    const topLevel = useMemo(
        () => (breakdown.data ?? []).filter((c) => c.parentId === null),
        [breakdown.data]
    );
    return (
        <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
                <CardHeader>
                    <CardTitle>Spending by category</CardTitle>
                    <CardDescription>Including sub-categories rolled up</CardDescription>
                </CardHeader>
                <CardContent className="h-[320px] sm:h-[400px]">
                    {breakdown.isLoading ? (
                        <Skeleton className="h-full w-full" />
                    ) : topLevel.length === 0 ? (
                        <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                            No spending to analyze
                        </p>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={topLevel}
                                    dataKey="subtreeTotal"
                                    nameKey="name"
                                    innerRadius={60}
                                    outerRadius={120}
                                    paddingAngle={2}
                                    label={(entry: any) => entry.name}
                                >
                                    {topLevel.map((c) => (
                                        <Cell key={c.id} fill={c.color} />
                                    ))}
                                </Pie>
                                <RTooltip
                                    contentStyle={{
                                        background: "var(--popover)",
                                        border: "1px solid var(--border)",
                                        borderRadius: 8,
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Top level</CardTitle>
                    <CardDescription>Rolled-up totals</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                    {topLevel.map((c) => (
                        <div
                            key={c.id}
                            className="flex items-center justify-between gap-3 rounded-md border border-border p-2"
                        >
                            <div className="flex min-w-0 items-center gap-2">
                                <EntityAvatar size="sm" color={c.color} icon={c.icon} />
                                <span className="truncate text-sm font-medium">{c.name}</span>
                            </div>
                            <MoneyDisplay
                                amount={c.subtreeTotal}
                                variant="expense"
                                className="text-sm"
                            />
                        </div>
                    ))}
                    {topLevel.length === 0 && !breakdown.isLoading && (
                        <p className="text-sm text-muted-foreground">No data</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function EnvelopesTab({
    periodStart,
    periodEnd,
}: {
    periodStart: Date;
    periodEnd: Date;
}) {
    const { space } = useCurrentSpace();
    const q = trpc.analytics.envelopeUtilization.useQuery({
        spaceId: space.id,
        periodStart,
        periodEnd,
    });
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {(q.data ?? []).map((e) => {
                const rawPct =
                    e.allocated > 0
                        ? (e.periodConsumed / e.allocated) * 100
                        : e.periodConsumed > 0
                          ? Infinity
                          : 0;
                const pct = Math.min(100, rawPct);
                const over = rawPct > 100;
                return (
                    <Card key={e.envelopId} style={{ borderLeft: `3px solid ${e.color}` }}>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between text-base">
                                <span className="flex min-w-0 items-center gap-2">
                                    <EntityAvatar
                                        size="sm"
                                        color={e.color}
                                        icon={e.icon}
                                    />
                                    <span className="truncate">{e.name}</span>
                                </span>
                                <span
                                    className={cn(
                                        "text-sm",
                                        over
                                            ? "font-semibold text-destructive"
                                            : "text-muted-foreground"
                                    )}
                                >
                                    {Number.isFinite(rawPct)
                                        ? `${rawPct.toFixed(0)}%`
                                        : "—"}
                                    {over && Number.isFinite(rawPct) && " over"}
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3">
                            <Progress
                                value={pct}
                                indicatorColor={over ? "var(--destructive)" : e.color}
                            />
                            <div className="grid grid-cols-3 gap-3 text-center">
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                        Allocated
                                    </p>
                                    <MoneyDisplay
                                        amount={e.allocated}
                                        className="text-sm font-bold"
                                    />
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                        Period
                                    </p>
                                    <MoneyDisplay
                                        amount={e.periodConsumed}
                                        variant="expense"
                                        className="text-sm font-bold"
                                    />
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                        Remaining
                                    </p>
                                    <MoneyDisplay
                                        amount={e.remaining}
                                        variant={e.remaining < 0 ? "expense" : "neutral"}
                                        className="text-sm font-bold"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
            {q.data && q.data.length === 0 && (
                <p className="text-sm text-muted-foreground">No envelopes yet.</p>
            )}
        </div>
    );
}

function BalanceTab({
    periodStart,
    periodEnd,
}: {
    periodStart: Date;
    periodEnd: Date;
}) {
    const { space } = useCurrentSpace();
    const q = trpc.analytics.balanceHistory.useQuery({
        spaceId: space.id,
        periodStart,
        periodEnd,
        bucket: "day",
    });
    return (
        <Card>
            <CardHeader>
                <CardTitle>Balance history</CardTitle>
                <CardDescription>Total space balance over time</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] px-1 sm:h-[360px] sm:px-6">
                {q.isLoading ? (
                    <Skeleton className="h-full w-full" />
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={q.data ?? []}>
                            <defs>
                                <linearGradient id="balance-grad" x1="0" y1="0" x2="0" y2="1">
                                    <stop
                                        offset="0%"
                                        stopColor="var(--primary)"
                                        stopOpacity={0.4}
                                    />
                                    <stop
                                        offset="100%"
                                        stopColor="var(--primary)"
                                        stopOpacity={0}
                                    />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis
                                dataKey="bucket"
                                tickFormatter={(v) => format(new Date(v), "MMM d")}
                                stroke="var(--muted-foreground)"
                                fontSize={11}
                            />
                            <YAxis
                                stroke="var(--muted-foreground)"
                                fontSize={11}
                                width={50}
                            />
                            <RTooltip
                                contentStyle={{
                                    background: "var(--popover)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 8,
                                }}
                                labelFormatter={(v) =>
                                    format(new Date(v as any), "MMM d, yyyy")
                                }
                            />
                            <Area
                                type="monotone"
                                dataKey="balance"
                                stroke="var(--primary)"
                                strokeWidth={2}
                                fill="url(#balance-grad)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}

function AccountsDistTab() {
    const { space } = useCurrentSpace();
    const q = trpc.analytics.accountDistribution.useQuery({ spaceId: space.id });
    return (
        <Card>
            <CardHeader>
                <CardTitle>Account distribution</CardTitle>
                <CardDescription>Where your money lives</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] sm:h-[360px]">
                {q.isLoading ? (
                    <Skeleton className="h-full w-full" />
                ) : !q.data || q.data.length === 0 ? (
                    <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        No accounts yet
                    </p>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={q.data.filter((a) => a.accountType !== "liability")}
                                dataKey="balance"
                                nameKey="name"
                                innerRadius={60}
                                outerRadius={120}
                                paddingAngle={2}
                                label={(entry: any) => entry.name}
                            >
                                {q.data
                                    .filter((a) => a.accountType !== "liability")
                                    .map((a) => (
                                        <Cell
                                            key={a.accountId}
                                            fill={a.color || colorForId(a.accountId)}
                                        />
                                    ))}
                            </Pie>
                            <RTooltip
                                contentStyle={{
                                    background: "var(--popover)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 8,
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}

function HeatmapTab() {
    const { space } = useCurrentSpace();
    const start = startOfYear(new Date());
    const end = endOfYear(new Date());
    const q = trpc.analytics.spendingHeatmap.useQuery({
        spaceId: space.id,
        periodStart: start,
        periodEnd: end,
    });

    const byDay = useMemo(() => {
        const m = new Map<string, number>();
        for (const r of q.data ?? []) {
            m.set(format(new Date(r.day), "yyyy-MM-dd"), r.total);
        }
        return m;
    }, [q.data]);

    const max = useMemo(() => {
        let m = 0;
        byDay.forEach((v) => (m = Math.max(m, v)));
        return m;
    }, [byDay]);

    const weeks = useMemo(() => {
        const arr: Date[][] = [];
        const first = startOfMonth(new Date(new Date().getFullYear(), 0, 1));
        first.setDate(first.getDate() - first.getDay());
        for (let w = 0; w < 53; w++) {
            const wk: Date[] = [];
            for (let d = 0; d < 7; d++) {
                const dt = new Date(first);
                dt.setDate(first.getDate() + w * 7 + d);
                wk.push(dt);
            }
            arr.push(wk);
        }
        return arr;
    }, []);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Spending heatmap</CardTitle>
                <CardDescription>Daily expense totals for the year</CardDescription>
            </CardHeader>
            <CardContent>
                {q.isLoading ? (
                    <Skeleton className="h-36 w-full" />
                ) : (
                    <div className="overflow-x-auto">
                        <div className="inline-flex gap-[3px]">
                            {weeks.map((wk, wi) => (
                                <div key={wi} className="flex flex-col gap-[3px]">
                                    {wk.map((d, di) => {
                                        const v = byDay.get(format(d, "yyyy-MM-dd")) ?? 0;
                                        const intensity =
                                            max > 0 ? Math.min(1, v / max) : 0;
                                        return (
                                            <div
                                                key={di}
                                                title={`${format(d, "MMM d")} — ${v.toFixed(2)}`}
                                                className={cn(
                                                    "size-[11px] rounded-[2px] border border-border/60",
                                                    v === 0 && "bg-muted/30"
                                                )}
                                                style={
                                                    v > 0
                                                        ? {
                                                              background: `color-mix(in oklab, var(--primary) ${Math.round(
                                                                  intensity * 100
                                                              )}%, transparent)`,
                                                          }
                                                        : undefined
                                                }
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
