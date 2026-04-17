import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
    ArrowRight,
    Wallet,
    Mail,
    Target,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
} from "lucide-react";
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip as RTooltip,
    XAxis,
    YAxis,
    Cell,
    PieChart,
    Pie,
} from "recharts";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { TransactionTypeBadge } from "@/components/shared/TransactionTypeBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import { addMonths, startOfMonth } from "@/lib/dates";
import { cn } from "@/lib/utils";

export default function OverviewPage() {
    const { space } = useCurrentSpace();

    const periodStart = startOfMonth();
    const periodEnd = addMonths(periodStart, 1);
    const cashFlowStart = addMonths(periodStart, -2);

    const summary = trpc.analytics.spaceSummary.useQuery({
        spaceId: space.id,
        periodStart,
        periodEnd,
    });
    const cashFlow = trpc.analytics.cashFlow.useQuery({
        spaceId: space.id,
        periodStart: cashFlowStart,
        periodEnd,
        bucket: "week",
    });
    const utilization = trpc.analytics.envelopeUtilization.useQuery({
        spaceId: space.id,
        periodStart,
        periodEnd,
    });
    const topCats = trpc.analytics.topCategories.useQuery({
        spaceId: space.id,
        periodStart,
        periodEnd,
        limit: 5,
    });
    const recentTx = trpc.transaction.listBySpace.useQuery({
        spaceId: space.id,
        limit: 6,
    });
    const plans = trpc.analytics.planProgress.useQuery({ spaceId: space.id });
    const events = trpc.event.listBySpace.useQuery({ spaceId: space.id });
    const accountsQuery = trpc.account.listBySpace.useQuery({ spaceId: space.id });

    const accountsById = useMemo(() => {
        const m = new Map<string, { name: string; color: string; icon: string }>();
        for (const a of accountsQuery.data ?? [])
            m.set(a.id, { name: a.name, color: a.color, icon: a.icon });
        return m;
    }, [accountsQuery.data]);

    const upcomingEvents = useMemo(
        () =>
            (events.data ?? [])
                .filter((e) => new Date(e.end_time).getTime() > Date.now())
                .slice(0, 4),
        [events.data]
    );

    const overAllocated = summary.data?.isOverAllocated ?? false;

    return (
        <div className="grid gap-5 sm:gap-6">
            <PageHeader
                title={`Welcome to ${space.name}`}
                description="Your finances at a glance"
            />

            {overAllocated && summary.data && (
                <Card className="border-destructive/40 bg-destructive/5">
                    <CardContent className="flex items-start gap-3 p-4">
                        <AlertTriangle className="mt-0.5 size-5 text-destructive" />
                        <div>
                            <p className="text-sm font-semibold text-destructive">
                                Over-allocated by{" "}
                                <MoneyDisplay
                                    amount={Math.abs(summary.data.unallocated)}
                                    className="font-bold text-destructive"
                                />
                            </p>
                            <p className="text-xs text-muted-foreground">
                                You've allocated more spendable money to envelopes and plans
                                than you have. Deallocate somewhere or record income to
                                balance.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-3 sm:gap-4 grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Net worth"
                    value={summary.data?.totalBalance ?? 0}
                    isLoading={summary.isLoading}
                />
                <StatCard
                    label="This month income"
                    value={summary.data?.periodIncome ?? 0}
                    variant="income"
                    isLoading={summary.isLoading}
                    icon={TrendingUp}
                />
                <StatCard
                    label="This month expenses"
                    value={summary.data?.periodExpense ?? 0}
                    variant="expense"
                    isLoading={summary.isLoading}
                    icon={TrendingDown}
                />
                <StatCard
                    label="Unallocated"
                    value={summary.data?.unallocated ?? 0}
                    isLoading={summary.isLoading}
                    variant={overAllocated ? "expense" : "neutral"}
                    description={
                        overAllocated
                            ? "Over-allocated"
                            : summary.data && summary.data.lockedBalance > 0
                              ? "Free to allocate (locked excluded)"
                              : "Free to allocate"
                    }
                />
            </div>

            <div className="grid gap-4 md:grid-cols-12">
                <Card className="md:col-span-8">
                    <CardHeader>
                        <CardTitle>Cash flow</CardTitle>
                        <CardDescription>
                            Weekly income vs expense, last 3 months
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="h-[260px] px-1 sm:h-[280px] sm:px-6">
                        {cashFlow.isLoading ? (
                            <Skeleton className="h-full w-full" />
                        ) : !cashFlow.data || cashFlow.data.length === 0 ? (
                            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                No cash flow data yet
                            </p>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={cashFlow.data}>
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
                                    <Bar
                                        dataKey="income"
                                        fill="var(--income)"
                                        radius={[4, 4, 0, 0]}
                                    />
                                    <Bar
                                        dataKey="expense"
                                        fill="var(--expense)"
                                        radius={[4, 4, 0, 0]}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                <Card className="md:col-span-4">
                    <CardHeader>
                        <CardTitle>Top categories</CardTitle>
                        <CardDescription>This month&apos;s biggest spends</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[260px] sm:h-[280px]">
                        {topCats.isLoading ? (
                            <Skeleton className="h-full w-full" />
                        ) : !topCats.data || topCats.data.length === 0 ? (
                            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                No spending yet
                            </p>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={topCats.data}
                                        dataKey="total"
                                        nameKey="name"
                                        innerRadius={40}
                                        outerRadius={80}
                                        paddingAngle={2}
                                    >
                                        {topCats.data.map((c) => (
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

                <Card className="md:col-span-6">
                    <CardHeader className="flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Mail className="size-4" />
                                Envelope utilization
                            </CardTitle>
                            <CardDescription>This month&apos;s consumption</CardDescription>
                        </div>
                        <Link
                            to={ROUTES.spaceEnvelopes(space.id)}
                            className="text-sm text-muted-foreground hover:text-primary"
                        >
                            View all
                            <ArrowRight className="ml-1 inline size-3.5" />
                        </Link>
                    </CardHeader>
                    <CardContent className="grid gap-3">
                        {utilization.isLoading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <Skeleton key={i} className="h-10 w-full" />
                            ))
                        ) : !utilization.data || utilization.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No envelopes yet</p>
                        ) : (
                            utilization.data.slice(0, 5).map((e) => {
                                const rawPct =
                                    e.allocated > 0
                                        ? (e.periodConsumed / e.allocated) * 100
                                        : e.periodConsumed > 0
                                          ? Infinity
                                          : 0;
                                const pct = Math.min(100, rawPct);
                                return (
                                    <div key={e.envelopId}>
                                        <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                                            <span className="flex min-w-0 items-center gap-2 font-medium">
                                                <EntityAvatar
                                                    size="sm"
                                                    color={e.color}
                                                    icon={e.icon}
                                                />
                                                <span className="truncate">{e.name}</span>
                                            </span>
                                            <span className="whitespace-nowrap text-xs text-muted-foreground">
                                                <MoneyDisplay amount={e.periodConsumed} /> /{" "}
                                                <MoneyDisplay amount={e.allocated} />
                                            </span>
                                        </div>
                                        <Progress
                                            value={pct}
                                            indicatorColor={
                                                rawPct > 100
                                                    ? "var(--destructive)"
                                                    : rawPct > 90
                                                      ? "var(--expense)"
                                                      : rawPct > 70
                                                        ? "var(--warning)"
                                                        : e.color
                                            }
                                        />
                                    </div>
                                );
                            })
                        )}
                    </CardContent>
                </Card>

                <Card className="md:col-span-6">
                    <CardHeader className="flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Target className="size-4" />
                                Plans
                            </CardTitle>
                            <CardDescription>Long-term goal progress</CardDescription>
                        </div>
                        <Link
                            to={ROUTES.spacePlans(space.id)}
                            className="text-sm text-muted-foreground hover:text-primary"
                        >
                            View all
                            <ArrowRight className="ml-1 inline size-3.5" />
                        </Link>
                    </CardHeader>
                    <CardContent className="grid gap-3">
                        {plans.isLoading ? (
                            Array.from({ length: 2 }).map((_, i) => (
                                <Skeleton key={i} className="h-10 w-full" />
                            ))
                        ) : !plans.data || plans.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No plans yet</p>
                        ) : (
                            plans.data.slice(0, 5).map((p) => (
                                <div key={p.planId}>
                                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                                        <span className="flex min-w-0 items-center gap-2 font-medium">
                                            <EntityAvatar
                                                size="sm"
                                                color={p.color}
                                                icon={p.icon}
                                            />
                                            <span className="truncate">{p.name}</span>
                                        </span>
                                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                                            <MoneyDisplay amount={p.allocated} />
                                            {p.targetAmount
                                                ? ` / ${p.targetAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                : ""}
                                        </span>
                                    </div>
                                    {p.pctComplete != null && (
                                        <Progress
                                            value={p.pctComplete}
                                            indicatorColor={p.color}
                                        />
                                    )}
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                <Card className="md:col-span-7">
                    <CardHeader className="flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Wallet className="size-4" />
                                Recent transactions
                            </CardTitle>
                        </div>
                        <Link
                            to={ROUTES.spaceTransactions(space.id)}
                            className="text-sm text-muted-foreground hover:text-primary"
                        >
                            View all
                            <ArrowRight className="ml-1 inline size-3.5" />
                        </Link>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        {recentTx.isLoading ? (
                            Array.from({ length: 4 }).map((_, i) => (
                                <Skeleton key={i} className="h-8 w-full" />
                            ))
                        ) : !recentTx.data || recentTx.data.items.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No transactions yet</p>
                        ) : (
                            recentTx.data.items.map((t) => {
                                const a =
                                    (t.source_account_id
                                        ? accountsById.get(t.source_account_id)
                                        : null) ||
                                    (t.destination_account_id
                                        ? accountsById.get(t.destination_account_id)
                                        : null);
                                return (
                                    <div
                                        key={t.id}
                                        className="flex items-center justify-between gap-3"
                                    >
                                        <div className="flex min-w-0 items-center gap-2">
                                            <TransactionTypeBadge type={t.type as any} />
                                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                {format(
                                                    new Date(t.transaction_datetime),
                                                    "MMM d"
                                                )}
                                            </span>
                                            <span className="truncate text-sm">
                                                {t.description ?? a?.name ?? ""}
                                            </span>
                                        </div>
                                        <MoneyDisplay
                                            amount={t.amount}
                                            variant={
                                                (t.type as unknown as string) === "income"
                                                    ? "income"
                                                    : (t.type as unknown as string) === "expense"
                                                      ? "expense"
                                                      : "transfer"
                                            }
                                        />
                                    </div>
                                );
                            })
                        )}
                    </CardContent>
                </Card>

                <Card className="md:col-span-5">
                    <CardHeader>
                        <CardTitle>Upcoming events</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        {events.isLoading ? (
                            Array.from({ length: 2 }).map((_, i) => (
                                <Skeleton key={i} className="h-8 w-full" />
                            ))
                        ) : upcomingEvents.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No upcoming events</p>
                        ) : (
                            upcomingEvents.map((ev) => (
                                <div
                                    key={ev.id}
                                    className="flex items-center justify-between gap-3"
                                >
                                    <span className="flex min-w-0 items-center gap-2">
                                        <EntityAvatar
                                            size="sm"
                                            color={ev.color}
                                            icon={ev.icon}
                                        />
                                        <span className="truncate text-sm font-medium">
                                            {ev.name}
                                        </span>
                                    </span>
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                                        {format(new Date(ev.start_time), "MMM d")}
                                    </span>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function StatCard({
    label,
    value,
    variant = "neutral",
    description,
    isLoading,
    icon: Icon,
}: {
    label: string;
    value: number;
    variant?: "neutral" | "income" | "expense";
    description?: string;
    isLoading?: boolean;
    icon?: React.ComponentType<{ className?: string }>;
}) {
    return (
        <Card>
            <CardContent className={cn("p-4 sm:p-5")}>
                <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
                        {label}
                    </p>
                    {Icon && <Icon className="size-4 text-muted-foreground" />}
                </div>
                {isLoading ? (
                    <Skeleton className="mt-3 h-7 w-24" />
                ) : (
                    <MoneyDisplay
                        amount={value}
                        variant={variant as any}
                        className="mt-2 block text-lg font-bold sm:text-2xl"
                    />
                )}
                {description && (
                    <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                )}
            </CardContent>
        </Card>
    );
}
