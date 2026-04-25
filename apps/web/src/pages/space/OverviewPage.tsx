import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowRight,
    Mail,
    Target,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    ArrowUp,
    PiggyBank,
    CalendarDays,
    Activity,
    ArrowLeftRight,
} from "lucide-react";
import {
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
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { PageHeader } from "@/components/shared/PageHeader";
import { TransactionTypeBadge } from "@/components/shared/TransactionTypeBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import { addMonths, endOfMonth, startOfMonth } from "@/lib/dates";
import { cn } from "@/lib/utils";

export default function OverviewPage() {
    const { space } = useCurrentSpace();
    const isPersonal = space.isPersonal;

    // Freeze `now` on mount. Every render otherwise creates a fresh Date;
    // tRPC/React Query serializes it into the query cache key, so the key
    // changes on every render and queries that use it as input refetch
    // forever and get stuck on isLoading.
    const [now] = useState(() => new Date());
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = addMonths(thisMonthStart, 1);
    const lastMonthStart = addMonths(thisMonthStart, -1);
    const cashFlowStart = addMonths(thisMonthStart, -2);

    // Each query has a real-space and personal-space variant. The `enabled`
    // flag disables the inactive one so react-query only fetches once per
    // render. The UI reads through a unified shape.
    const summarySpace = trpc.analytics.spaceSummary.useQuery(
        { spaceId: space.id, periodStart: thisMonthStart, periodEnd: thisMonthEnd },
        { enabled: !isPersonal }
    );
    const summaryPersonal = trpc.personal.summary.useQuery(
        { periodStart: thisMonthStart, periodEnd: thisMonthEnd },
        { enabled: isPersonal }
    );
    const summary = isPersonal ? summaryPersonal : summarySpace;

    const lastMonthSpace = trpc.analytics.spaceSummary.useQuery(
        { spaceId: space.id, periodStart: lastMonthStart, periodEnd: thisMonthStart },
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
        { periodStart: cashFlowStart, periodEnd: thisMonthEnd, bucket: "week" },
        { enabled: isPersonal }
    );
    const cashFlow = isPersonal ? cashFlowPersonal : cashFlowSpace;

    const utilizationSpace = trpc.analytics.envelopeUtilization.useQuery(
        { spaceId: space.id, periodStart: thisMonthStart, periodEnd: thisMonthEnd },
        { enabled: !isPersonal }
    );
    const utilizationPersonal = trpc.personal.envelopeUtilization.useQuery(
        { periodStart: thisMonthStart, periodEnd: thisMonthEnd },
        { enabled: isPersonal }
    );
    const utilization = isPersonal ? utilizationPersonal : utilizationSpace;

    const recentTxSpace = trpc.transaction.listBySpace.useQuery(
        { spaceId: space.id, limit: 8 },
        { enabled: !isPersonal }
    );
    const recentTxPersonal = trpc.personal.transactions.useQuery(
        { limit: 8 },
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

    const events = trpc.event.listBySpace.useQuery(
        { spaceId: space.id },
        { enabled: !isPersonal }
    );

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

    // Drift alerts — (envelope, account) partitions where consumed exceeds
    // allocated. Surface the worst offenders as actionable todo rows.
    const driftRows = useMemo(() => {
        const rows: Array<{
            envelopId: string;
            envelopName: string;
            envelopColor: string;
            envelopIcon: string;
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
                        accountName: account?.name ?? "Unassigned pool",
                        overBy: Math.abs(b.remaining),
                    });
                }
            }
        }
        rows.sort((a, b) => b.overBy - a.overBy);
        return rows;
    }, [utilization.data, accountsById]);

    // Envelopes where total spent for the period exceeds total allocated —
    // distinct from account-level drift; this is the "X is over budget"
    // alert in the redesign.
    const overBudgetEnvelopes = useMemo(
        () =>
            (utilization.data ?? [])
                .filter((e) => e.allocated > 0 && e.consumed > e.allocated)
                .map((e) => ({
                    envelopId: e.envelopId,
                    name: e.name,
                    color: e.color,
                    icon: e.icon,
                    allocated: e.allocated,
                    consumed: e.consumed,
                    overBy: e.consumed - e.allocated,
                    pctOver: (e.consumed / e.allocated) * 100,
                }))
                .sort((a, b) => b.overBy - a.overBy),
        [utilization.data]
    );

    // Plans that are clearly on-pace — a positive signal worth surfacing.
    // Use the top-progress plan as a single "you're on track" row.
    const topPlan = useMemo(() => {
        return (plans.data ?? [])
            .filter((p) => p.pctComplete != null && p.pctComplete > 0)
            .sort((a, b) => (b.pctComplete ?? 0) - (a.pctComplete ?? 0))[0];
    }, [plans.data]);

    const upcomingEvents = useMemo(
        () =>
            (events.data ?? [])
                .filter((e) => new Date(e.end_time).getTime() > now.getTime())
                .slice(0, 4),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [events.data]
    );

    const overAllocated = summary.data?.isOverAllocated ?? false;
    const unallocated = summary.data?.unallocated ?? 0;

    // Month-over-month deltas.
    //   null       → still loading (hide indicator)
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

    // "Daily budget remaining" — the single actionable number from the
    // redesign. unallocated / days remaining in the month. Hidden when
    // over-allocated (shown as a blocking alert instead).
    const dailyBudget = useMemo(() => {
        if (overAllocated || unallocated <= 0) return null;
        const daysLeft = Math.max(1, monthProgress.remaining);
        return { perDay: unallocated / daysLeft, daysLeft };
    }, [overAllocated, unallocated, monthProgress.remaining]);

    const anyAttentionItems =
        overAllocated ||
        driftRows.length > 0 ||
        overBudgetEnvelopes.length > 0 ||
        (unallocated > 0 && !overAllocated) ||
        !!topPlan;

    return (
        <div className="grid gap-6">
            <PageHeader
                eyebrow={`${formatInAppTz(now, "EEEE · MMMM d")} · day ${monthProgress.elapsed} of ${monthProgress.total}`}
                title={space.name}
                description={
                    dailyBudget ? (
                        <>
                            You can spend{" "}
                            <strong className="font-semibold text-foreground">
                                <MoneyDisplay amount={dailyBudget.perDay} />
                            </strong>
                            /day for the next {dailyBudget.daysLeft} days.
                        </>
                    ) : undefined
                }
            />

            {/* ============ Attention feed — the hero of the redesign ============ */}
            {(summary.isLoading || utilization.isLoading || anyAttentionItems) && (
                <Card className="p-0">
                    <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border px-5 py-4">
                        <div>
                            <CardTitle className="text-sm font-medium">
                                What needs your attention
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Drift, overspend, and plans off-track — each actionable
                            </CardDescription>
                        </div>
                        <span className="o-eyebrow">This month</span>
                    </CardHeader>
                    <CardContent className="p-0">
                        {summary.isLoading || utilization.isLoading ? (
                            <div className="space-y-2 p-5">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <Skeleton key={i} className="h-14 w-full" />
                                ))}
                            </div>
                        ) : (
                            <>
                                {overAllocated && (
                                    <TodoRow
                                        tone="bad"
                                        icon={<AlertTriangle className="size-3.5" />}
                                        title={
                                            <>
                                                Over-allocated by{" "}
                                                <MoneyDisplay
                                                    amount={Math.abs(unallocated)}
                                                />
                                            </>
                                        }
                                        sub="You've parked more in envelopes and plans than you have. Deallocate or record income."
                                        amount={
                                            <MoneyDisplay
                                                amount={Math.abs(unallocated)}
                                                signed
                                            />
                                        }
                                        to={ROUTES.spaceEnvelopes(space.id)}
                                    />
                                )}

                                {overBudgetEnvelopes.slice(0, 3).map((e) => (
                                    <TodoRow
                                        key={e.envelopId}
                                        tone="bad"
                                        icon={<AlertTriangle className="size-3.5" />}
                                        title={
                                            <>
                                                <span className="font-semibold">
                                                    {e.name}
                                                </span>{" "}
                                                is {Math.round(e.pctOver - 100)}% over budget
                                            </>
                                        }
                                        sub={
                                            <>
                                                <MoneyDisplay amount={e.consumed} /> spent
                                                of <MoneyDisplay amount={e.allocated} /> ·{" "}
                                                {monthProgress.remaining} day
                                                {monthProgress.remaining === 1 ? "" : "s"}{" "}
                                                left
                                            </>
                                        }
                                        amount={
                                            <>
                                                +<MoneyDisplay amount={e.overBy} />
                                            </>
                                        }
                                        to={ROUTES.spaceEnvelopeDetail(
                                            space.id,
                                            e.envelopId
                                        )}
                                        leadingEntity={{ color: e.color, icon: e.icon }}
                                    />
                                ))}

                                {driftRows.length > 0 && (
                                    <TodoRow
                                        tone="warn"
                                        icon={<ArrowLeftRight className="size-3.5" />}
                                        title={
                                            <>
                                                {driftRows.length} envelope partition
                                                {driftRows.length === 1 ? "" : "s"} drifted
                                            </>
                                        }
                                        sub={
                                            <>
                                                Spending exceeded allocation by{" "}
                                                <MoneyDisplay
                                                    amount={driftRows.reduce(
                                                        (s, r) => s + r.overBy,
                                                        0
                                                    )}
                                                />{" "}
                                                across accounts. Rebalance to keep
                                                partitions honest.
                                            </>
                                        }
                                        amount={String(driftRows.length)}
                                        to={ROUTES.spaceEnvelopes(space.id)}
                                    />
                                )}

                                {!overAllocated && unallocated > 1 && (
                                    <TodoRow
                                        tone="info"
                                        icon={<ArrowUp className="size-3.5" />}
                                        title={
                                            <>
                                                <MoneyDisplay amount={unallocated} /> is
                                                unallocated
                                            </>
                                        }
                                        sub="Park it in envelopes or plans to keep allocations honest."
                                        amount={<MoneyDisplay amount={unallocated} />}
                                        to={ROUTES.spaceEnvelopes(space.id)}
                                    />
                                )}

                                {topPlan && (topPlan.pctComplete ?? 0) > 0 && (
                                    <TodoRow
                                        tone="plan"
                                        icon={<Target className="size-3.5" />}
                                        title={
                                            <>
                                                <span className="font-semibold">
                                                    {topPlan.name}
                                                </span>{" "}
                                                is {Math.round(topPlan.pctComplete ?? 0)}%
                                                funded
                                            </>
                                        }
                                        sub={
                                            topPlan.targetAmount
                                                ? `You're on pace toward ${formatShort(topPlan.targetAmount)}`
                                                : "You're on pace."
                                        }
                                        amount={`${Math.round(topPlan.pctComplete ?? 0)}%`}
                                        to={ROUTES.spacePlanDetail(
                                            space.id,
                                            topPlan.planId
                                        )}
                                        leadingEntity={{
                                            color: topPlan.color,
                                            icon: topPlan.icon,
                                        }}
                                    />
                                )}

                                {!summary.isLoading &&
                                    !utilization.isLoading &&
                                    !anyAttentionItems && (
                                        <div className="flex items-center gap-3 px-5 py-6 text-sm text-muted-foreground">
                                            <span className="o-todo-row__ic o-todo-row--good">
                                                ✓
                                            </span>
                                            <span>
                                                Nothing to act on right now. Enjoy the
                                                calm.
                                            </span>
                                        </div>
                                    )}
                            </>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* ============ KPI grid ============ */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
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

            {/* ============ Cash flow — the story chart ============ */}
            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-sm font-medium">
                            <TrendingUp className="size-4" />
                            Cash flow
                        </CardTitle>
                        <CardDescription>
                            Weekly in vs out, last 3 months
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
                                        formatInAppTz(v as string, "MMM d, yyyy")
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

            {/* ============ Month pacing hint ============ */}
            <Card>
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
                                <p className="o-eyebrow">Net this month</p>
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
                                <p className="o-eyebrow">Envelope spend</p>
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

            {/* ============ Envelopes + Plans (condensed) ============ */}
            <div className="grid gap-4 md:grid-cols-12">
                <Card className="md:col-span-6">
                    <CardHeader className="flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-sm font-medium">
                                <Mail className="size-4" />
                                Envelope utilization
                            </CardTitle>
                            <CardDescription>This month's consumption</CardDescription>
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
                                        className="-mx-1 rounded-md px-1 py-1 hover:bg-accent/30"
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
                                            spent={e.consumed}
                                            allocated={e.allocated}
                                            indicatorColor={
                                                rawPct > 90
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
                            <CardTitle className="flex items-center gap-2 text-sm font-medium">
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
                                    className="-mx-1 rounded-md px-1 py-1 hover:bg-accent/30"
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
            </div>

            {/* ============ Activity feed + upcoming events ============ */}
            <div className="grid gap-4 md:grid-cols-12">
                <Card className="md:col-span-7">
                    <CardHeader className="flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-sm font-medium">
                                <Activity className="size-4" />
                                {isPersonal ? "Recent transactions" : "Space activity"}
                            </CardTitle>
                            <CardDescription>
                                {isPersonal
                                    ? "Your latest moves"
                                    : "Who's been doing what"}
                            </CardDescription>
                        </div>
                        <DrillLink
                            to={ROUTES.spaceTransactions(space.id)}
                            label="View all"
                        />
                    </CardHeader>
                    <CardContent className="grid gap-3">
                        {recentTx.isLoading ? (
                            Array.from({ length: 4 }).map((_, i) => (
                                <Skeleton key={i} className="h-10 w-full" />
                            ))
                        ) : !recentTx.data || recentTx.data.items.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No transactions yet
                            </p>
                        ) : (
                            recentTx.data.items.map((t) => {
                                const srcAcc = t.source_account_id
                                    ? accountsById.get(t.source_account_id)
                                    : null;
                                const dstAcc = t.destination_account_id
                                    ? accountsById.get(t.destination_account_id)
                                    : null;
                                const account = srcAcc ?? dstAcc;
                                return (
                                    <div
                                        key={t.id}
                                        className="flex items-center justify-between gap-3 border-b border-border/40 pb-3 last:border-b-0 last:pb-0"
                                    >
                                        <div className="flex min-w-0 items-center gap-3">
                                            <UserAvatar
                                                fileId={t.created_by_avatar_file_id}
                                                firstName={t.created_by_first_name ?? ""}
                                                lastName={t.created_by_last_name ?? ""}
                                                size="sm"
                                            />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm">
                                                    <span className="font-medium">
                                                        {t.created_by_first_name ?? "—"}
                                                    </span>{" "}
                                                    <span className="text-muted-foreground">
                                                        {verbForType(
                                                            t.type as unknown as string
                                                        )}
                                                    </span>{" "}
                                                    <span>
                                                        {t.description ??
                                                            account?.name ??
                                                            ""}
                                                    </span>
                                                </p>
                                                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <TransactionTypeBadge
                                                        type={
                                                            t.type as unknown as
                                                                | "income"
                                                                | "expense"
                                                                | "transfer"
                                                                | "adjustment"
                                                        }
                                                    />
                                                    <span>
                                                        {formatInAppTz(
                                                            t.transaction_datetime,
                                                            "MMM d"
                                                        )}
                                                    </span>
                                                </p>
                                            </div>
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
                                            className="font-semibold"
                                        />
                                    </div>
                                );
                            })
                        )}
                    </CardContent>
                </Card>

                {!isPersonal && (
                    <Card className="md:col-span-5">
                        <CardHeader className="flex-row items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-sm font-medium">
                                <CalendarDays className="size-4" />
                                Upcoming events
                            </CardTitle>
                            <DrillLink
                                to={ROUTES.spaceEvents(space.id)}
                                label="View all"
                            />
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
                                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                                            {formatInAppTz(ev.start_time, "MMM d")}
                                        </span>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}

function TodoRow({
    tone,
    icon,
    title,
    sub,
    amount,
    to,
    leadingEntity,
}: {
    tone: "bad" | "warn" | "info" | "plan" | "good";
    icon: React.ReactNode;
    title: React.ReactNode;
    sub: React.ReactNode;
    amount: React.ReactNode;
    to: string;
    leadingEntity?: { color: string; icon: string };
}) {
    const toneClass =
        tone === "bad"
            ? "o-todo-row--bad"
            : tone === "warn"
              ? "o-todo-row--warn"
              : tone === "info"
                ? "o-todo-row--info"
                : tone === "plan"
                  ? "o-todo-row--plan"
                  : "o-todo-row--good";

    return (
        <Link to={to} className={cn("o-todo-row", toneClass)}>
            {leadingEntity ? (
                <EntityAvatar
                    size="sm"
                    color={leadingEntity.color}
                    icon={leadingEntity.icon}
                />
            ) : (
                <span className="o-todo-row__ic">{icon}</span>
            )}
            <div className="min-w-0">
                <p className="truncate text-sm font-medium">{title}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
            </div>
            <div className="o-todo-row__amount">{amount}</div>
            <ArrowRight className="o-todo-row__trail size-4 text-muted-foreground" />
        </Link>
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
            // new expense is bad.
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
                    <p className="o-eyebrow">{label}</p>
                    {Icon && <Icon className="size-4 text-muted-foreground" />}
                </div>
                {isLoading ? (
                    <Skeleton className="mt-3 h-7 w-24" />
                ) : (
                    <MoneyDisplay
                        amount={value}
                        variant={variant as "income" | "expense" | "neutral"}
                        className="o-num-xl mt-2 block"
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

function verbForType(type: string): string {
    if (type === "income") return "received";
    if (type === "transfer") return "transferred";
    if (type === "adjustment") return "adjusted";
    return "spent";
}
