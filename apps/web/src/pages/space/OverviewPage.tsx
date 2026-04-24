import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowRight,
    Wallet,
    Mail,
    Target,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    Network,
    Activity,
    CalendarDays,
    PiggyBank,
    ArrowRightLeft,
    Layers,
} from "lucide-react";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip as RTooltip,
    XAxis,
    YAxis,
} from "recharts";
import { differenceInCalendarDays } from "date-fns";
import { formatInAppTz } from "@/lib/formatDate";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { TransactionTypeBadge } from "@/components/shared/TransactionTypeBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { Donut } from "@/components/shared/charts/Donut";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import { addDays, addMonths, endOfMonth, startOfMonth } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { UNALLOCATED_COLOR } from "@/lib/entityStyle";

export default function OverviewPage() {
    const { space } = useCurrentSpace();
    const isPersonal = space.isPersonal;

    // Freeze `now` on mount. Every render otherwise creates a fresh Date;
    // tRPC/React Query serializes it into the query cache key (ISO ms
    // precision), so the key changes on every render and queries that use
    // it as input (balance history's periodEnd) refetch forever and get
    // stuck on isLoading.
    const [now] = useState(() => new Date());
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = addMonths(thisMonthStart, 1);
    const lastMonthStart = addMonths(thisMonthStart, -1);
    const cashFlowStart = addMonths(thisMonthStart, -2);
    const trendStart = addDays(now, -29);

    // Each query has a real-space and personal-space variant. The
    // `enabled` flag disables the inactive one so react-query only
    // fetches once per render. `summary`, `cashFlow`, etc. below pick
    // the active one; the UI reads through a unified shape.
    const summarySpace = trpc.analytics.spaceSummary.useQuery(
        {
            spaceId: space.id,
            periodStart: thisMonthStart,
            periodEnd: thisMonthEnd,
        },
        { enabled: !isPersonal }
    );
    const summaryPersonal = trpc.personal.summary.useQuery(
        { periodStart: thisMonthStart, periodEnd: thisMonthEnd },
        { enabled: isPersonal }
    );
    const summary = isPersonal ? summaryPersonal : summarySpace;

    const lastMonthSpace = trpc.analytics.spaceSummary.useQuery(
        {
            spaceId: space.id,
            periodStart: lastMonthStart,
            periodEnd: thisMonthStart,
        },
        { enabled: !isPersonal }
    );
    const lastMonthPersonal = trpc.personal.summary.useQuery(
        { periodStart: lastMonthStart, periodEnd: thisMonthStart },
        { enabled: isPersonal }
    );
    const lastMonthSummary = isPersonal ? lastMonthPersonal : lastMonthSpace;

    const cashFlowSpace = trpc.analytics.cashFlow.useQuery(
        {
            spaceId: space.id,
            periodStart: cashFlowStart,
            periodEnd: thisMonthEnd,
            bucket: "week",
        },
        { enabled: !isPersonal }
    );
    const cashFlowPersonal = trpc.personal.cashFlow.useQuery(
        {
            periodStart: cashFlowStart,
            periodEnd: thisMonthEnd,
            bucket: "week",
        },
        { enabled: isPersonal }
    );
    const cashFlow = isPersonal ? cashFlowPersonal : cashFlowSpace;

    const balanceTrendSpace = trpc.analytics.balanceHistory.useQuery(
        {
            spaceId: space.id,
            periodStart: trendStart,
            periodEnd: now,
            bucket: "day",
        },
        { enabled: !isPersonal }
    );
    const balanceTrendPersonal = trpc.personal.balanceHistory.useQuery(
        { periodStart: trendStart, periodEnd: now, bucket: "day" },
        { enabled: isPersonal }
    );
    const balanceTrend = isPersonal ? balanceTrendPersonal : balanceTrendSpace;

    // Collapse the per-account series returned by balanceHistory into a
    // single total line for this summary card. Bucket values arrive as ISO
    // strings over the wire (no superjson transformer).
    const balanceTrendSeries = useMemo(() => {
        if (!balanceTrend.data) return [];
        const byBucket = new Map<string, number>();
        for (const row of balanceTrend.data.series) {
            const bucketKey =
                typeof row.bucket === "string"
                    ? row.bucket
                    : new Date(row.bucket).toISOString();
            byBucket.set(bucketKey, (byBucket.get(bucketKey) ?? 0) + row.balance);
        }
        return Array.from(byBucket.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([bucket, balance]) => ({ bucket, balance }));
    }, [balanceTrend.data]);

    const utilizationSpace = trpc.analytics.envelopeUtilization.useQuery(
        {
            spaceId: space.id,
            periodStart: thisMonthStart,
            periodEnd: thisMonthEnd,
        },
        { enabled: !isPersonal }
    );
    const utilizationPersonal = trpc.personal.envelopeUtilization.useQuery(
        { periodStart: thisMonthStart, periodEnd: thisMonthEnd },
        { enabled: isPersonal }
    );
    const utilization = isPersonal ? utilizationPersonal : utilizationSpace;

    // Priority breakdown (must / need / want / luxury) — space only.
    // Personal view doesn't have its own priorityBreakdown procedure
    // because the concept is space-local (categories live per space).
    const priorityBreakdownQuery = trpc.analytics.priorityBreakdown.useQuery(
        {
            spaceId: space.id,
            periodStart: thisMonthStart,
            periodEnd: thisMonthEnd,
        },
        { enabled: !isPersonal }
    );

    // Recent transactions. personal.transactions returns the same
    // snake_case shape as transaction.listBySpace (plus a few
    // personal-only enrichments), so both paths feed the same UI.
    const recentTxSpace = trpc.transaction.listBySpace.useQuery(
        { spaceId: space.id, limit: 6 },
        { enabled: !isPersonal }
    );
    const recentTxPersonal = trpc.personal.transactions.useQuery(
        { limit: 6 },
        { enabled: isPersonal }
    );
    const recentTx = isPersonal ? recentTxPersonal : recentTxSpace;

    const plansSpace = trpc.analytics.planProgress.useQuery(
        { spaceId: space.id },
        { enabled: !isPersonal }
    );
    const plansPersonal = trpc.personal.planProgress.useQuery(undefined, {
        enabled: isPersonal,
    });
    const plans = isPersonal ? plansPersonal : plansSpace;

    // Events are space-scoped and don't render in the virtual space
    // (no cross-space event concept yet). Always fetch for real spaces;
    // the virtual overview hides the widget entirely.
    const events = trpc.event.listBySpace.useQuery(
        { spaceId: space.id },
        { enabled: !isPersonal }
    );

    // Account list for the overview (used to annotate recent txns).
    // In the virtual space, show owned accounts.
    const accountsSpace = trpc.account.listBySpace.useQuery(
        { spaceId: space.id },
        { enabled: !isPersonal }
    );
    const accountsPersonal = trpc.personal.ownedAccounts.useQuery(undefined, {
        enabled: isPersonal,
    });
    const accountsQuery = isPersonal
        ? {
              ...accountsPersonal,
              data: accountsPersonal.data?.map((a) => ({
                  id: a.id,
                  name: a.name,
                  color: a.color,
                  icon: a.icon,
              })),
          }
        : accountsSpace;

    const accountsById = useMemo(() => {
        const m = new Map<string, { name: string; color: string; icon: string }>();
        for (const a of accountsQuery.data ?? [])
            m.set(a.id, { name: a.name, color: a.color, icon: a.icon });
        return m;
    }, [accountsQuery.data]);

    const upcomingEvents = useMemo(
        () =>
            (events.data ?? [])
                .filter((e) => new Date(e.end_time).getTime() > now.getTime())
                .slice(0, 4),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [events.data]
    );

    // Spending donut is envelope-first (one slice per envelope), so it
    // agrees with the Category analytics view's top-level drill. Built
    // from envelopeUtilization's per-envelope `consumed` — which already
    // rolls up transactions via category → envelope + transfer fees.
    const topCatsDonut = useMemo(
        () =>
            (utilization.data ?? [])
                .filter((e) => e.consumed > 0)
                .map((e) => ({
                    id: e.envelopId,
                    name: e.name,
                    value: e.consumed,
                    color: e.color,
                    hint: "Envelope total for this period",
                })),
        [utilization.data]
    );

    const priorityDonut = useMemo(
        () =>
            (priorityBreakdownQuery.data ?? [])
                .filter((t) => t.total > 0)
                .map((t) => ({
                    id: t.priority,
                    name: t.label,
                    value: Number(t.total),
                    color: t.color,
                })),
        [priorityBreakdownQuery.data]
    );

    // Space-level allocation map: envelope current-period remaining +
    // plan allocated + unallocated (positive only; over-allocation is
    // shown in the banner above, not as a negative slice).
    const allocationDonut = useMemo(() => {
        const env = (utilization.data ?? [])
            .filter((e) => e.remaining > 0)
            .map((e) => ({
                id: "env-" + e.envelopId,
                name: e.name,
                value: e.remaining,
                color: e.color,
                hint: `Envelope · ${e.cadence === "monthly" ? "monthly" : "rolling"}`,
            }));
        const pln = (plans.data ?? [])
            .filter((p) => p.allocated > 0)
            .map((p) => ({
                id: "plan-" + p.planId,
                name: p.name,
                value: p.allocated,
                color: p.color,
                hint: "Plan",
            }));
        const unallocated = summary.data?.unallocated ?? 0;
        const unSlice =
            unallocated > 0
                ? [
                      {
                          id: "unallocated",
                          name: "Unallocated",
                          value: unallocated,
                          color: UNALLOCATED_COLOR,
                          hint: "Free to allocate",
                      },
                  ]
                : [];
        return [...env, ...pln, ...unSlice];
    }, [utilization.data, plans.data, summary.data]);

    // Drift alerts — (envelope, account) partitions where consumed exceeds
    // allocated. Surface the top offenders with a shortcut to each
    // envelope's detail page for rebalancing.
    const driftAlerts = useMemo(() => {
        const rows: Array<{
            envelopId: string;
            envelopName: string;
            envelopColor: string;
            envelopIcon: string;
            accountId: string | null;
            accountName: string;
            overBy: number;
        }> = [];
        for (const e of utilization.data ?? []) {
            for (const b of e.breakdown) {
                if (b.isDrift && b.remaining < 0) {
                    const account = b.accountId ? accountsById.get(b.accountId) : null;
                    rows.push({
                        envelopId: e.envelopId,
                        envelopName: e.name,
                        envelopColor: e.color,
                        envelopIcon: e.icon,
                        accountId: b.accountId,
                        accountName: account?.name ?? "Unassigned pool",
                        overBy: Math.abs(b.remaining),
                    });
                }
            }
        }
        // Sort by overspend magnitude, worst first
        rows.sort((a, b) => b.overBy - a.overBy);
        const total = rows.reduce((s, r) => s + r.overBy, 0);
        return { rows, total };
    }, [utilization.data, accountsById]);

    const overAllocated = summary.data?.isOverAllocated ?? false;

    // Month-over-month deltas.
    //   null       → data still loading (hide indicator)
    //   0          → no change (or both zero)
    //   Infinity   → previous was zero, current is non-zero (render "New")
    //   finite num → percent change
    const monthOverMonth = useMemo(() => {
        const cur = summary.data;
        const prev = lastMonthSummary.data;
        const delta = (c?: number, p?: number): number | null => {
            if (c == null || p == null) return null;
            if (p === 0) return c === 0 ? 0 : Infinity;
            return ((c - p) / Math.abs(p)) * 100;
        };
        return {
            incomeDelta: delta(cur?.periodIncome, prev?.periodIncome),
            expenseDelta: delta(cur?.periodExpense, prev?.periodExpense),
        };
    }, [summary.data, lastMonthSummary.data]);

    // Days progress of the current month
    const monthProgress = useMemo(() => {
        const total = differenceInCalendarDays(endOfMonth(now), thisMonthStart);
        const elapsed = differenceInCalendarDays(now, thisMonthStart) + 1;
        const pct = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;
        return {
            elapsed,
            total,
            pct,
            remaining: Math.max(0, total - elapsed),
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="grid gap-5 sm:gap-6">
            <PageHeader
                title={`Welcome to ${space.name}`}
                description={`${formatInAppTz(now, "MMMM d, yyyy")} · day ${monthProgress.elapsed} of ${monthProgress.total}`}
                actions={
                    <Button asChild variant="outline" size="sm">
                        <Link to={ROUTES.spaceAnalytics(space.id)}>
                            <Network className="size-4" />
                            All analytics
                        </Link>
                    </Button>
                }
            />

            {/* Attention: over-allocation at space level */}
            {overAllocated && summary.data && (
                <Card className="border-destructive/40 bg-destructive/5">
                    <CardContent className="flex items-start gap-3 p-4">
                        <AlertTriangle className="mt-0.5 size-5 text-destructive" />
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-destructive">
                                Over-allocated by{" "}
                                <MoneyDisplay
                                    amount={Math.abs(summary.data.unallocated)}
                                    className="font-bold text-destructive"
                                />
                            </p>
                            <p className="text-xs text-muted-foreground">
                                You&apos;ve allocated more spendable money to envelopes and
                                plans than you have. Deallocate somewhere or record income
                                to balance.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Attention: envelope-account drift */}
            {driftAlerts.rows.length > 0 && (
                <Card className="border-amber-500/40 bg-[color:var(--warning)]/5">
                    <CardHeader className="flex-row items-start gap-3 space-y-0 pb-3">
                        <AlertTriangle className="mt-0.5 size-5 text-[color:var(--warning)]" />
                        <div className="flex-1">
                            <CardTitle className="text-sm font-semibold text-[color:var(--warning)]">
                                Account drift in {driftAlerts.rows.length} envelope
                                partition{driftAlerts.rows.length === 1 ? "" : "s"}
                            </CardTitle>
                            <CardDescription>
                                Spending exceeded allocation by{" "}
                                <MoneyDisplay
                                    amount={driftAlerts.total}
                                    className="font-semibold"
                                />{" "}
                                across accounts. Rebalance to keep partitions honest.
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="grid gap-1.5">
                            {driftAlerts.rows.slice(0, 4).map((r, i) => (
                                <Link
                                    key={`${r.envelopId}-${r.accountId ?? "un"}-${i}`}
                                    to={ROUTES.spaceEnvelopeDetail(
                                        space.id,
                                        r.envelopId
                                    )}
                                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors hover:border-foreground/30"
                                >
                                    <span className="flex min-w-0 items-center gap-2">
                                        <EntityAvatar
                                            size="sm"
                                            color={r.envelopColor}
                                            icon={r.envelopIcon}
                                        />
                                        <span className="truncate font-medium">
                                            {r.envelopName}
                                        </span>
                                        <span className="text-muted-foreground">·</span>
                                        <span className="truncate text-xs text-muted-foreground">
                                            {r.accountName}
                                        </span>
                                    </span>
                                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-destructive">
                                        <MoneyDisplay
                                            amount={-r.overBy}
                                            className="font-semibold text-destructive"
                                        />
                                        <ArrowRightLeft className="size-3" />
                                    </span>
                                </Link>
                            ))}
                            {driftAlerts.rows.length > 4 && (
                                <p className="pl-2 text-xs text-muted-foreground">
                                    …and {driftAlerts.rows.length - 4} more
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Row 1 — Key stats */}
            <div className="grid gap-3 sm:gap-4 grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Net worth"
                    value={summary.data?.totalBalance ?? 0}
                    isLoading={summary.isLoading}
                    description={
                        summary.data && summary.data.lockedBalance > 0
                            ? `${formatShort(summary.data.lockedBalance)} locked`
                            : undefined
                    }
                />
                <StatCard
                    label="Income this month"
                    value={summary.data?.periodIncome ?? 0}
                    variant="income"
                    isLoading={summary.isLoading}
                    icon={TrendingUp}
                    trendPct={monthOverMonth.incomeDelta}
                    trendDirection="higher-better"
                />
                <StatCard
                    label="Expenses this month"
                    value={summary.data?.periodExpense ?? 0}
                    variant="expense"
                    isLoading={summary.isLoading}
                    icon={TrendingDown}
                    trendPct={monthOverMonth.expenseDelta}
                    trendDirection="lower-better"
                />
                <StatCard
                    label="Unallocated"
                    value={summary.data?.unallocated ?? 0}
                    isLoading={summary.isLoading}
                    variant={overAllocated ? "expense" : "neutral"}
                    icon={PiggyBank}
                    description={
                        overAllocated
                            ? "Over-allocated"
                            : summary.data && summary.data.lockedBalance > 0
                              ? "Locked excluded"
                              : "Free to allocate"
                    }
                />
            </div>

            {/* Row 2 — Balance trend */}
            <div className="grid gap-4 md:grid-cols-12">
                <Card className="md:col-span-12">
                    <CardHeader className="flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Activity className="size-4" />
                                Balance trend
                            </CardTitle>
                            <CardDescription>Last 30 days</CardDescription>
                        </div>
                        <DrillLink
                            to={ROUTES.spaceAnalyticsDetail(space.id, "balance")}
                        />
                    </CardHeader>
                    <CardContent className="h-[240px] px-1 sm:h-[280px] sm:px-6">
                        {balanceTrend.isLoading ? (
                            <Skeleton className="h-full w-full" />
                        ) : balanceTrendSeries.length === 0 ? (
                            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                No balance history yet.
                            </p>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={balanceTrendSeries}>
                                    <defs>
                                        <linearGradient
                                            id="overview-trend-grad"
                                            x1="0"
                                            y1="0"
                                            x2="0"
                                            y2="1"
                                        >
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
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke="var(--border)"
                                    />
                                    <XAxis
                                        dataKey="bucket"
                                        tickFormatter={(v) =>
                                            formatInAppTz(v, "MMM d")
                                        }
                                        stroke="var(--muted-foreground)"
                                        fontSize={11}
                                        interval={0}
                                        angle={-45}
                                        textAnchor="end"
                                        height={56}
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
                                            formatInAppTz(v as any, "MMM d, yyyy")
                                        }
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="balance"
                                        stroke="var(--primary)"
                                        strokeWidth={2}
                                        fill="url(#overview-trend-grad)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

            </div>

            {/* Row 3 — Allocation map + Spending by envelope + Priority
                 (triptych on md+; priority hidden on personal) */}
            <div
                className={cn(
                    "grid gap-4 md:grid-cols-12",
                )}
            >
                <Card className={isPersonal ? "md:col-span-6" : "md:col-span-4"}>
                    <CardHeader className="flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Network className="size-4" />
                                Allocation map
                            </CardTitle>
                            <CardDescription>Where money is parked</CardDescription>
                        </div>
                        <DrillLink
                            to={ROUTES.spaceAnalyticsDetail(space.id, "allocations")}
                        />
                    </CardHeader>
                    <CardContent>
                        {utilization.isLoading ||
                        plans.isLoading ||
                        summary.isLoading ? (
                            <Skeleton className="h-[280px] w-full" />
                        ) : (
                            <Donut
                                data={allocationDonut}
                                centerLabel="Spendable"
                                centerValue={summary.data?.spendableBalance ?? 0}
                                height={280}
                                ringRatio={0.6}
                                emptyLabel="No allocations yet"
                            />
                        )}
                    </CardContent>
                </Card>

                <Card className={isPersonal ? "md:col-span-6" : "md:col-span-4"}>
                    <CardHeader className="flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <PiggyBank className="size-4" />
                                Spending by envelope
                            </CardTitle>
                            <CardDescription>
                                This month&apos;s biggest spends. Click to drill.
                            </CardDescription>
                        </div>
                        <DrillLink
                            to={ROUTES.spaceAnalyticsDetail(space.id, "categories")}
                        />
                    </CardHeader>
                    <CardContent>
                        {utilization.isLoading ? (
                            <Skeleton className="h-[280px] w-full" />
                        ) : (
                            <Donut
                                data={topCatsDonut}
                                centerLabel="Total spent"
                                height={280}
                                ringRatio={0.6}
                                emptyLabel="No spending yet"
                            />
                        )}
                    </CardContent>
                </Card>

                {!isPersonal && (
                    <Card className="md:col-span-4">
                        <CardHeader className="flex-row items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Layers className="size-4" />
                                    By priority
                                </CardTitle>
                                <CardDescription>
                                    Must vs want this month.
                                </CardDescription>
                            </div>
                            <DrillLink
                                to={ROUTES.spaceAnalyticsDetail(space.id, "priority")}
                            />
                        </CardHeader>
                        <CardContent>
                            {priorityBreakdownQuery.isLoading ? (
                                <Skeleton className="h-[280px] w-full" />
                            ) : (
                                <Donut
                                    data={priorityDonut}
                                    centerLabel="Total spent"
                                    height={280}
                                    ringRatio={0.6}
                                    emptyLabel="No spending yet"
                                />
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Row 4 — Cash flow full width */}
            <div className="grid gap-4 md:grid-cols-12">
                <Card className="md:col-span-12">
                    <CardHeader className="flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="size-4" />
                                Cash flow
                            </CardTitle>
                            <CardDescription>
                                Weekly income vs expense, last 3 months
                            </CardDescription>
                        </div>
                        <DrillLink to={ROUTES.spaceAnalyticsDetail(space.id, "cash-flow")} />
                    </CardHeader>
                    <CardContent className="h-[240px] px-1 sm:h-[280px] sm:px-6">
                        {cashFlow.isLoading ? (
                            <Skeleton className="h-full w-full" />
                        ) : !cashFlow.data || cashFlow.data.length === 0 ? (
                            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                No cash flow data yet
                            </p>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={cashFlow.data}>
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke="var(--border)"
                                    />
                                    <XAxis
                                        dataKey="bucket"
                                        tickFormatter={(v) => formatInAppTz(v, "MMM d")}
                                        stroke="var(--muted-foreground)"
                                        fontSize={11}
                                    />
                                    <YAxis
                                        stroke="var(--muted-foreground)"
                                        fontSize={11}
                                        width={50}
                                    />
                                    <RTooltip
                                        cursor={{ fill: "var(--accent)", opacity: 0.5 }}
                                        contentStyle={{
                                            background: "var(--popover)",
                                            border: "1px solid var(--border)",
                                            borderRadius: 8,
                                        }}
                                        labelFormatter={(v) =>
                                            formatInAppTz(v as any, "MMM d, yyyy")
                                        }
                                    />
                                    <Bar
                                        dataKey="income"
                                        fill="var(--income)"
                                        radius={[6, 6, 0, 0]}
                                    />
                                    <Bar
                                        dataKey="expense"
                                        fill="var(--expense)"
                                        radius={[6, 6, 0, 0]}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                {/* Row 5 — Month pacing hint */}
                <Card className="md:col-span-12">
                    <CardContent className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:p-5">
                        <div className="grid gap-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-medium">Month progress</span>
                                <span className="text-muted-foreground">
                                    {monthProgress.elapsed} / {monthProgress.total} days ·{" "}
                                    {monthProgress.remaining} left
                                </span>
                            </div>
                            <Progress value={monthProgress.pct} />
                        </div>
                        {!summary.isLoading && summary.data && (
                            <div className="flex items-center gap-4 text-right text-sm">
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                        Net this month
                                    </p>
                                    <MoneyDisplay
                                        amount={summary.data.periodNet}
                                        variant={
                                            summary.data.periodNet < 0 ? "expense" : "income"
                                        }
                                        className="text-base font-bold"
                                        signed
                                    />
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                        Envelope spend
                                    </p>
                                    <MoneyDisplay
                                        amount={summary.data.envelopeConsumed}
                                        variant="expense"
                                        className="text-base font-bold"
                                    />
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Row 5 — Envelopes + Plans */}
                <Card className="md:col-span-6">
                    <CardHeader className="flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Mail className="size-4" />
                                Envelope utilization
                            </CardTitle>
                            <CardDescription>
                                This month&apos;s consumption
                            </CardDescription>
                        </div>
                        <DrillLink
                            to={ROUTES.spaceAnalyticsDetail(space.id, "envelopes")}
                        />
                    </CardHeader>
                    <CardContent className="grid gap-3">
                        {utilization.isLoading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <Skeleton key={i} className="h-10 w-full" />
                            ))
                        ) : !utilization.data || utilization.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No envelopes yet
                            </p>
                        ) : (
                            utilization.data.slice(0, 5).map((e) => {
                                const rawPct =
                                    e.allocated > 0
                                        ? (e.consumed / e.allocated) * 100
                                        : e.consumed > 0
                                          ? Infinity
                                          : 0;
                                const pct = Math.min(100, rawPct);
                                return (
                                    <Link
                                        key={e.envelopId}
                                        to={ROUTES.spaceEnvelopeDetail(
                                            space.id,
                                            e.envelopId
                                        )}
                                        className="rounded-md px-1 py-1 -mx-1 hover:bg-accent/30"
                                    >
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
                                                <MoneyDisplay amount={e.consumed} /> /{" "}
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
                                    </Link>
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
                        <DrillLink to={ROUTES.spacePlans(space.id)} label="View all" />
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
                                <Link
                                    key={p.planId}
                                    to={ROUTES.spacePlanDetail(space.id, p.planId)}
                                    className="rounded-md px-1 py-1 -mx-1 hover:bg-accent/30"
                                >
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
                                                ? ` / ${formatShort(p.targetAmount)}`
                                                : ""}
                                        </span>
                                    </div>
                                    {p.pctComplete != null && (
                                        <Progress
                                            value={p.pctComplete}
                                            indicatorColor={p.color}
                                        />
                                    )}
                                </Link>
                            ))
                        )}
                    </CardContent>
                </Card>

                {/* Row 6 — Recent transactions + upcoming events */}
                <Card className="md:col-span-7">
                    <CardHeader className="flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Wallet className="size-4" />
                                Recent transactions
                            </CardTitle>
                        </div>
                        <DrillLink
                            to={ROUTES.spaceTransactions(space.id)}
                            label="View all"
                        />
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        {recentTx.isLoading ? (
                            Array.from({ length: 4 }).map((_, i) => (
                                <Skeleton key={i} className="h-8 w-full" />
                            ))
                        ) : !recentTx.data || recentTx.data.items.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No transactions yet
                            </p>
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
                                                {formatInAppTz(
                                                    t.transaction_datetime,
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
                                                    : (t.type as unknown as string) ===
                                                        "expense"
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
                    <CardHeader className="flex-row items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <CalendarDays className="size-4" />
                            Upcoming events
                        </CardTitle>
                        <DrillLink to={ROUTES.spaceEvents(space.id)} label="View all" />
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        {events.isLoading ? (
                            Array.from({ length: 2 }).map((_, i) => (
                                <Skeleton key={i} className="h-8 w-full" />
                            ))
                        ) : upcomingEvents.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No upcoming events
                            </p>
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
                                        {formatInAppTz(ev.start_time, "MMM d")}
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

function DrillLink({ to, label = "Details" }: { to: string; label?: string }) {
    return (
        <Link
            to={to}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
            {label}
            <ArrowRight className="size-3" />
        </Link>
    );
}

function StatCard({
    label,
    value,
    variant = "neutral",
    description,
    isLoading,
    icon: Icon,
    trendPct,
    trendDirection = "higher-better",
}: {
    label: string;
    value: number;
    variant?: "neutral" | "income" | "expense";
    description?: string;
    isLoading?: boolean;
    icon?: React.ComponentType<{ className?: string }>;
    /** Month-over-month delta as a percentage. Null hides the indicator. */
    trendPct?: number | null;
    /** How to color the delta — "higher-better" shows up-green for positive. */
    trendDirection?: "higher-better" | "lower-better";
}) {
    // Delta states:
    //   null       → still loading (render nothing)
    //   Infinity   → previous-period was zero → show a "New" pill
    //   finite num → percentage change
    const isNew = trendPct === Infinity;
    const showTrend = trendPct != null && (Number.isFinite(trendPct) || isNew);
    let trendColor = "text-muted-foreground";
    if (showTrend) {
        if (isNew) {
            // "New" signals direction via variant: new income is good,
            // new expense is bad. higher-better income → +income color,
            // lower-better expense → +expense color.
            trendColor =
                trendDirection === "higher-better"
                    ? "text-[color:var(--income)]"
                    : "text-[color:var(--expense)]";
        } else {
            const good =
                trendDirection === "higher-better" ? trendPct > 0 : trendPct < 0;
            const bad =
                trendDirection === "higher-better" ? trendPct < 0 : trendPct > 0;
            if (good) trendColor = "text-[color:var(--income)]";
            else if (bad) trendColor = "text-[color:var(--expense)]";
        }
    }
    const TrendIcon =
        !showTrend || trendPct === 0
            ? null
            : isNew || trendPct! > 0
              ? TrendingUp
              : TrendingDown;

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
                {(description || showTrend) && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        {showTrend && (
                            <span
                                className={cn(
                                    "inline-flex items-center gap-0.5 font-medium",
                                    trendColor
                                )}
                            >
                                {TrendIcon && <TrendIcon className="size-3" />}
                                {isNew
                                    ? "New vs last month"
                                    : `${Math.abs(trendPct!).toFixed(0)}% vs last month`}
                            </span>
                        )}
                        {description && (
                            <span className="text-muted-foreground">{description}</span>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function formatShort(n: number): string {
    return n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}
