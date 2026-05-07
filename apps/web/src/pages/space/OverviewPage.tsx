import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { differenceInCalendarDays } from "date-fns";
import { observer } from "mobx-react-lite";
import { formatInAppTz } from "@/lib/formatDate";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import { addDays, addMonths, endOfMonth, startOfMonth } from "@/lib/dates";
import { UNALLOCATED_COLOR } from "@/lib/entityStyle";
import { useStore } from "@/stores/useStore";

/* =============================================================
   OVERVIEW PAGE — editorial-dark design (orbit-4)
   Same data surface as before; visual layer rebuilt to match the
   design canvas. Wraps in .orbit-design to opt into the scoped
   token set (deep-emerald near-black + emerald/gold accents).
   ============================================================= */
export default observer(function OverviewPage() {
    const { space } = useCurrentSpace();
    const { authStore } = useStore();
    const isPersonal = space.isPersonal;
    const userName = authStore.user?.name?.split(" ")[0] ?? "you";

    const [now] = useState(() => new Date());
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = addMonths(thisMonthStart, 1);
    const lastMonthStart = addMonths(thisMonthStart, -1);
    const cashFlowStart = addMonths(thisMonthStart, -2);
    const trendStart = addDays(now, -29);

    /* ---------- Queries: real-space + personal variants ---------- */
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
        { spaceId: space.id, periodStart: cashFlowStart, periodEnd: thisMonthEnd, bucket: "week" },
        { enabled: !isPersonal }
    );
    const cashFlowPersonal = trpc.personal.cashFlow.useQuery(
        { periodStart: cashFlowStart, periodEnd: thisMonthEnd, bucket: "week" },
        { enabled: isPersonal }
    );
    const cashFlow = isPersonal ? cashFlowPersonal : cashFlowSpace;

    const balanceTrendSpace = trpc.analytics.balanceHistory.useQuery(
        { spaceId: space.id, periodStart: trendStart, periodEnd: now, bucket: "day" },
        { enabled: !isPersonal }
    );
    const balanceTrendPersonal = trpc.personal.balanceHistory.useQuery(
        { periodStart: trendStart, periodEnd: now, bucket: "day" },
        { enabled: isPersonal }
    );
    const balanceTrend = isPersonal ? balanceTrendPersonal : balanceTrendSpace;

    const balanceTrendSeries = useMemo(() => {
        if (!balanceTrend.data) return [] as Array<{ bucket: string; balance: number }>;
        const byBucket = new Map<string, number>();
        for (const row of balanceTrend.data.series) {
            const key =
                typeof row.bucket === "string"
                    ? row.bucket
                    : new Date(row.bucket).toISOString();
            byBucket.set(key, (byBucket.get(key) ?? 0) + row.balance);
        }
        return Array.from(byBucket.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([bucket, balance]) => ({ bucket, balance }));
    }, [balanceTrend.data]);

    const utilizationSpace = trpc.analytics.envelopeUtilization.useQuery(
        { spaceId: space.id, periodStart: thisMonthStart, periodEnd: thisMonthEnd },
        { enabled: !isPersonal }
    );
    const utilizationPersonal = trpc.personal.envelopeUtilization.useQuery(
        { periodStart: thisMonthStart, periodEnd: thisMonthEnd },
        { enabled: isPersonal }
    );
    const utilization = isPersonal ? utilizationPersonal : utilizationSpace;

    const priorityBreakdownQuery = trpc.analytics.priorityBreakdown.useQuery(
        { spaceId: space.id, periodStart: thisMonthStart, periodEnd: thisMonthEnd },
        { enabled: !isPersonal }
    );

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

    /* Personal-only: per-space net-worth split for the "Across N spaces"
       band at the top of the My-money overview. Only fetched when active. */
    const spaceBreakdown = trpc.personal.spaceBreakdown.useQuery(undefined, {
        enabled: isPersonal,
    });

    /* Per-account distribution (id, name, color, icon, balance, type) —
       drives Net worth composition + Accounts at a glance. Same shape
       across real-space and personal variants. */
    const acctDistSpace = trpc.analytics.accountDistribution.useQuery(
        { spaceId: space.id },
        { enabled: !isPersonal }
    );
    const acctDistPersonal = trpc.personal.accountDistribution.useQuery(undefined, {
        enabled: isPersonal,
    });
    const accountDistribution = isPersonal ? acctDistPersonal : acctDistSpace;

    /* Daily spend by day (for the calendar heatmap on FLOW). */
    const heatmapSpace = trpc.analytics.spendingHeatmap.useQuery(
        { spaceId: space.id, periodStart: thisMonthStart, periodEnd: thisMonthEnd },
        { enabled: !isPersonal }
    );
    const heatmapPersonal = trpc.personal.spendingHeatmap.useQuery(
        { periodStart: thisMonthStart, periodEnd: thisMonthEnd },
        { enabled: isPersonal }
    );
    const heatmap = isPersonal ? heatmapPersonal : heatmapSpace;

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

    /* ---------- Derived chart data ---------- */
    const topCatsDonut = useMemo(
        () =>
            (utilization.data ?? [])
                .filter((e) => e.consumed > 0)
                .map((e) => ({
                    id: e.envelopId,
                    name: e.name,
                    value: e.consumed,
                    color: e.color,
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

    const allocationDonut = useMemo(() => {
        const env = (utilization.data ?? [])
            .filter((e) => e.remaining > 0)
            .map((e) => ({ id: "env-" + e.envelopId, name: e.name, value: e.remaining, color: e.color }));
        const pln = (plans.data ?? [])
            .filter((p) => p.allocated > 0)
            .map((p) => ({ id: "plan-" + p.planId, name: p.name, value: p.allocated, color: p.color }));
        const unallocated = summary.data?.unallocated ?? 0;
        const unSlice =
            unallocated > 0
                ? [{ id: "unallocated", name: "Unallocated", value: unallocated, color: UNALLOCATED_COLOR }]
                : [];
        return [...env, ...pln, ...unSlice];
    }, [utilization.data, plans.data, summary.data]);

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
        rows.sort((a, b) => b.overBy - a.overBy);
        const total = rows.reduce((s, r) => s + r.overBy, 0);
        return { rows, total };
    }, [utilization.data, accountsById]);

    const overAllocated = summary.data?.isOverAllocated ?? false;

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
        return { elapsed, total, pct, remaining: Math.max(0, total - elapsed) };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const eyebrow = isPersonal
        ? "Personal · all spaces"
        : `${formatInAppTz(now, "MMMM yyyy")} · Day ${monthProgress.elapsed} of ${monthProgress.total}`;

    const title = isPersonal ? "Your money, across spaces" : `Welcome back, ${userName}`;
    const subtitle = isPersonal
        ? "A unified view of accounts you own — across every space you're in."
        : "Here's your money today.";

    return (
        <div className="orbit-design ov-root">
            <style>{OV_STYLES}</style>

            {/* Topbar */}
            <header className="ov-topbar">
                <div className="ov-topbar-text">
                    <span className="eyebrow">{eyebrow}</span>
                    <h1 className="display ov-title">{title}</h1>
                    <p className="ov-sub">{subtitle}</p>
                </div>
                <div className="ov-topbar-actions">
                    <button className="od-btn">
                        <FilterIcon />
                        This month
                    </button>
                    <Link to={ROUTES.spaceAnalytics(space.id)} className="od-btn ov-link-btn">
                        <ChartIcon />
                        All analytics
                    </Link>
                    {!isPersonal && (
                        <Link to={ROUTES.spaceTransactions(space.id)} className="od-btn od-btn-primary ov-link-btn">
                            <PlusIcon />
                            New transaction
                        </Link>
                    )}
                </div>
            </header>

            <div className="ov-scroll">
                {/* Today band — quick-glance daily summary at the very top.
                    NET TODAY / TRANSACTIONS / CLEARED / PENDING / LAST SYNC.
                    TODO: connect to backend (no daily-bucket procedure yet);
                    using dummy values so the strip is visible in design. */}
                <TodayBand now={now} />

                {/* Personal-only "across spaces" band — gold-accented
                    aggregator showing the user's share of every space
                    they're in plus accounts only they own. */}
                {isPersonal && spaceBreakdown.data && (
                    <PersonalSpaceBand data={spaceBreakdown.data} />
                )}

                {/* Drift / attention banner — real space only */}
                {!isPersonal && driftAlerts.rows.length > 0 && (
                    <div className="od-card ov-drift">
                        <div className="ov-drift-head">
                            <div className="ov-drift-headline">
                                <span className="ov-drift-icon">
                                    <BoltIcon />
                                </span>
                                <div>
                                    <div className="ov-drift-title">
                                        Account drift in {driftAlerts.rows.length} envelope partition
                                        {driftAlerts.rows.length === 1 ? "" : "s"}
                                    </div>
                                    <div className="ov-drift-sub">
                                        Spending exceeded allocation by{" "}
                                        <Money amount={driftAlerts.total} variant="warn" /> across
                                        accounts. Rebalance to keep partitions honest.
                                    </div>
                                </div>
                            </div>
                            <button className="od-btn">
                                Review · {driftAlerts.rows.length}
                            </button>
                        </div>
                        <div className="ov-drift-rows">
                            {driftAlerts.rows.slice(0, 4).map((r, i) => (
                                <Link
                                    key={`${r.envelopId}-${r.accountId ?? "un"}-${i}`}
                                    to={ROUTES.spaceEnvelopeDetail(space.id, r.envelopId)}
                                    className="ov-drift-row"
                                >
                                    <span className="ov-drift-row-left">
                                        <EntityAvatar icon={r.envelopIcon} colorVar={r.envelopColor} size={26} />
                                        <span className="ov-drift-row-name">{r.envelopName}</span>
                                        <span className="ov-drift-row-acct">· {r.accountName}</span>
                                    </span>
                                    <span className="ov-drift-row-right">
                                        <Money amount={-r.overBy} variant="expense" />
                                        <ChevronRightIcon />
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* Over-allocation banner */}
                {overAllocated && summary.data && (
                    <div className="od-card ov-over">
                        <div className="ov-drift-headline">
                            <span className="ov-drift-icon ov-over-icon">
                                <BoltIcon />
                            </span>
                            <div>
                                <div className="ov-drift-title" style={{ color: "var(--expense)" }}>
                                    Over-allocated by{" "}
                                    <Money amount={Math.abs(summary.data.unallocated)} variant="expense" />
                                </div>
                                <div className="ov-drift-sub">
                                    More money is allocated to envelopes and plans than you actually
                                    have. Deallocate somewhere or record income to balance.
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <SectionEyebrow label="Position" sub="Where you stand right now" />

                {/* 4-stat row */}
                <div className="ov-stat-row">
                    <StatTile
                        label="Net worth"
                        amount={summary.data?.totalBalance ?? 0}
                        loading={summary.isLoading}
                        icon={<LayersIcon />}
                        accent="color-mix(in oklab, var(--brand) 18%, transparent)"
                        delta={
                            summary.data && summary.data.lockedBalance > 0 ? (
                                <>
                                    <Money amount={summary.data.lockedBalance} size={11} variant="muted" /> locked
                                </>
                            ) : null
                        }
                    />
                    <StatTile
                        label={`Income · ${formatInAppTz(now, "MMM")}`}
                        amount={summary.data?.periodIncome ?? 0}
                        variant="income"
                        loading={summary.isLoading}
                        icon={<TrendUpIcon />}
                        accent="color-mix(in oklab, var(--income) 14%, transparent)"
                        delta={renderDelta(monthOverMonth.incomeDelta, "higher-better")}
                        signed
                    />
                    <StatTile
                        label={`Expenses · ${formatInAppTz(now, "MMM")}`}
                        amount={summary.data?.periodExpense ?? 0}
                        variant="expense"
                        loading={summary.isLoading}
                        icon={<TrendDownIcon />}
                        accent="color-mix(in oklab, var(--expense) 14%, transparent)"
                        delta={renderDelta(monthOverMonth.expenseDelta, "lower-better")}
                    />
                    <StatTile
                        label="Unallocated"
                        amount={summary.data?.unallocated ?? 0}
                        loading={summary.isLoading}
                        variant={overAllocated ? "expense" : "fg"}
                        icon={<WalletIcon />}
                        delta={
                            overAllocated
                                ? "Over-allocated"
                                : summary.data && summary.data.lockedBalance > 0
                                  ? "Locked excluded"
                                  : "Free to allocate"
                        }
                    />
                </div>

                {/* Balance trend */}
                <div className="od-card ov-section">
                    <SectionHead
                        title={
                            <>
                                <TrendUpIcon color="var(--brand)" /> Balance trend
                            </>
                        }
                        sub="Last 30 days · across all accounts"
                        action={
                            <Link
                                to={ROUTES.spaceAnalyticsDetail(space.id, "balance")}
                                className="ov-details-link"
                            >
                                Details →
                            </Link>
                        }
                    />
                    {balanceTrend.isLoading ? (
                        <Skeleton height={210} />
                    ) : balanceTrendSeries.length === 0 ? (
                        <EmptyHint>No balance history yet.</EmptyHint>
                    ) : (
                        <BalanceTrend series={balanceTrendSeries} />
                    )}
                </div>

                {/* Net worth composition — assets minus liabilities, with
                    the 12-month trendline and per-category split bars.
                    Derived from accountDistribution; YoY/12-month series
                    is dummy until we add a multi-month query. */}
                <NetWorthComposition
                    accounts={accountDistribution.data ?? []}
                    loading={accountDistribution.isLoading}
                />

                <SectionEyebrow label="Composition" sub="How money is split, parked & spent" />

                {/* Donut trio */}
                <div className={`ov-trio ${isPersonal ? "ov-trio-2" : ""}`}>
                    <DonutCard
                        title={
                            <>
                                <LayersIcon color="var(--fg-3)" /> Allocation map
                            </>
                        }
                        sub="Where money is parked"
                        action={
                            <Link
                                to={ROUTES.spaceAnalyticsDetail(space.id, "allocations")}
                                className="ov-details-link"
                            >
                                Details →
                            </Link>
                        }
                        slices={allocationDonut}
                        centerLabel="Spendables"
                        centerValue={formatShort(summary.data?.spendableBalance ?? 0)}
                        loading={utilization.isLoading || plans.isLoading || summary.isLoading}
                    />
                    <DonutCard
                        title={
                            <>
                                <CartIcon color="var(--ent-2)" /> Spending by envelope
                            </>
                        }
                        sub="This month's biggest spends. Click to drill."
                        action={
                            <Link
                                to={ROUTES.spaceAnalyticsDetail(space.id, "categories")}
                                className="ov-details-link"
                            >
                                Details →
                            </Link>
                        }
                        slices={topCatsDonut}
                        centerLabel="Top envelope"
                        centerValue={
                            topCatsDonut[0]
                                ? formatShort(topCatsDonut[0].value)
                                : "—"
                        }
                        loading={utilization.isLoading}
                    />
                    {!isPersonal && (
                        <DonutCard
                            title={
                                <>
                                    <FlagIcon color="var(--expense)" /> By priority
                                </>
                            }
                            sub="Must vs want this month"
                            action={
                                <Link
                                    to={ROUTES.spaceAnalyticsDetail(space.id, "priority")}
                                    className="ov-details-link"
                                >
                                    Details →
                                </Link>
                            }
                            slices={priorityDonut}
                            centerLabel="Total spent"
                            centerValue={formatShort(
                                priorityDonut.reduce((s, x) => s + x.value, 0)
                            )}
                            loading={priorityBreakdownQuery.isLoading}
                        />
                    )}
                </div>

                <SectionEyebrow label="Flow" sub="Money moving in and out" />

                {/* Cash flow */}
                <div className="od-card ov-section">
                    <SectionHead
                        title={
                            <>
                                <TrendUpIcon color="var(--income)" /> Cash flow
                            </>
                        }
                        sub="Weekly income vs expense, last 3 months"
                        action={
                            <span className="ov-cf-legend">
                                <span className="ov-legend-chip">
                                    <span style={{ background: "var(--income)" }} /> Income
                                </span>
                                <span className="ov-legend-chip">
                                    <span style={{ background: "var(--expense)" }} /> Expense
                                </span>
                                <Link
                                    to={ROUTES.spaceAnalyticsDetail(space.id, "cash-flow")}
                                    className="ov-details-link"
                                >
                                    Details →
                                </Link>
                            </span>
                        }
                    />
                    {cashFlow.isLoading ? (
                        <Skeleton height={200} />
                    ) : !cashFlow.data || cashFlow.data.length === 0 ? (
                        <EmptyHint>No cash flow data yet.</EmptyHint>
                    ) : (
                        <CashFlow
                            data={cashFlow.data.map((d) => ({
                                bucket: typeof d.bucket === "string" ? d.bucket : new Date(d.bucket).toISOString(),
                                income: d.income,
                                expense: d.expense,
                            }))}
                        />
                    )}
                </div>

                {/* Month progress strip — only on real space */}
                {!isPersonal && summary.data && (
                    <div className="od-card ov-progress-strip">
                        <div className="ov-progress-bar">
                            <div className="ov-progress-bar-head">
                                <span className="ov-progress-label">Month progress</span>
                                <span className="ov-progress-meta">
                                    {monthProgress.elapsed} / {monthProgress.total} days · {monthProgress.remaining} left
                                </span>
                            </div>
                            <ProgressBar value={monthProgress.pct / 100} color="var(--brand)" height={6} />
                        </div>
                        <div className="ov-progress-stats">
                            <div>
                                <div className="ov-stat-eyebrow">Net this month</div>
                                <Money
                                    amount={summary.data.periodNet}
                                    variant={summary.data.periodNet < 0 ? "expense" : "income"}
                                    size={14}
                                    weight={500}
                                    signed
                                />
                            </div>
                            <div>
                                <div className="ov-stat-eyebrow">Envelope spend</div>
                                <Money
                                    amount={summary.data.envelopeConsumed}
                                    variant="expense"
                                    size={14}
                                    weight={500}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Heatmap + Top movers (row 2 of FLOW) */}
                <div className="ov-grid-7-5">
                    <DailyHeatmap
                        now={now}
                        data={(heatmap.data ?? []).map((r) => ({
                            day: typeof r.day === "string" ? new Date(r.day) : r.day,
                            total: r.total,
                        }))}
                        loading={heatmap.isLoading}
                    />
                    {/*
                       Top movers — week-over-week category shifts.
                       TODO: connect to backend (no per-category WoW
                       procedure yet); rendering dummy data so the
                       card is visible in design.
                    */}
                    <TopMovers />
                </div>

                <SectionEyebrow label="Targets" sub="Envelopes, plans, spending against budget" />

                {/* Envelopes + Plans */}
                <div className="ov-grid-2">
                    <div className="od-card ov-section">
                        <SectionHead
                            title={
                                <>
                                    <CartIcon color="var(--ent-2)" /> Envelope utilization
                                </>
                            }
                            sub="This month's consumption"
                            action={
                                <Link
                                    to={ROUTES.spaceAnalyticsDetail(space.id, "envelopes")}
                                    className="ov-details-link"
                                >
                                    Details →
                                </Link>
                            }
                        />
                        <div className="ov-list-col">
                            {utilization.isLoading
                                ? Array.from({ length: 3 }).map((_, i) => (
                                      <Skeleton key={i} height={32} />
                                  ))
                                : !utilization.data || utilization.data.length === 0
                                  ? <EmptyHint compact>No envelopes yet</EmptyHint>
                                  : utilization.data.slice(0, 5).map((e) => {
                                        const rawPct = e.allocated > 0 ? e.consumed / e.allocated : 0;
                                        const drift = rawPct > 1;
                                        return (
                                            <Link
                                                key={e.envelopId}
                                                to={ROUTES.spaceEnvelopeDetail(space.id, e.envelopId)}
                                                className="ov-list-row"
                                            >
                                                <div className="ov-list-row-head">
                                                    <span className="ov-list-row-name">
                                                        <EntityAvatar
                                                            icon={e.icon}
                                                            colorVar={e.color}
                                                            size={22}
                                                        />
                                                        {e.name}
                                                        {drift && (
                                                            <span className="ov-chip ov-chip-drift">drift</span>
                                                        )}
                                                    </span>
                                                    <span className="ov-list-row-amt">
                                                        <Money
                                                            amount={e.consumed}
                                                            size={11.5}
                                                            variant={drift ? "expense" : "neutral"}
                                                        />{" "}
                                                        <span style={{ color: "var(--fg-4)" }}>
                                                            /{" "}
                                                            <Money
                                                                amount={e.allocated}
                                                                size={11.5}
                                                                variant="muted"
                                                            />
                                                        </span>
                                                    </span>
                                                </div>
                                                <ProgressBar
                                                    value={rawPct}
                                                    color={e.color}
                                                    height={4}
                                                />
                                            </Link>
                                        );
                                    })}
                        </div>
                    </div>

                    <div className="od-card ov-section">
                        <SectionHead
                            title={
                                <>
                                    <TargetIcon color="var(--gold)" /> Plans
                                </>
                            }
                            sub="Long-term goal progress"
                            action={
                                <Link to={ROUTES.spacePlans(space.id)} className="ov-details-link">
                                    View all →
                                </Link>
                            }
                        />
                        <div className="ov-list-col">
                            {plans.isLoading
                                ? Array.from({ length: 3 }).map((_, i) => (
                                      <Skeleton key={i} height={32} />
                                  ))
                                : !plans.data || plans.data.length === 0
                                  ? <EmptyHint compact>No plans yet</EmptyHint>
                                  : plans.data.slice(0, 5).map((p) => {
                                        const pct = p.pctComplete != null ? p.pctComplete / 100 : 0;
                                        return (
                                            <Link
                                                key={p.planId}
                                                to={ROUTES.spacePlanDetail(space.id, p.planId)}
                                                className="ov-list-row"
                                            >
                                                <div className="ov-list-row-head">
                                                    <span className="ov-list-row-name">
                                                        <EntityAvatar
                                                            icon={p.icon}
                                                            colorVar={p.color}
                                                            size={22}
                                                        />
                                                        {p.name}
                                                    </span>
                                                    <span className="ov-list-row-amt">
                                                        <Money amount={p.allocated} size={11.5} />
                                                        {p.targetAmount ? (
                                                            <>
                                                                {" "}
                                                                <span style={{ color: "var(--fg-4)" }}>
                                                                    /{" "}
                                                                    <Money
                                                                        amount={p.targetAmount}
                                                                        size={11.5}
                                                                        variant="muted"
                                                                    />
                                                                </span>
                                                            </>
                                                        ) : null}
                                                    </span>
                                                </div>
                                                <ProgressBar value={pct} color={p.color} height={4} />
                                            </Link>
                                        );
                                    })}
                        </div>
                    </div>
                </div>

                {/* Spending trends — cumulative spend vs last month + projection.
                    TODO: connect to backend (no cumulative-spend procedure yet);
                    using the cashFlow expense series as a proxy and a dummy
                    projection until we add a dedicated query. */}
                <SpendingTrends
                    monthProgress={monthProgress}
                    monthExpense={summary.data?.periodExpense ?? 0}
                    lastMonthExpense={lastMonthSummary.data?.periodExpense ?? 0}
                />

                <SectionEyebrow
                    label="Forward"
                    sub="What's coming up — bills, recurring, events"
                />

                {/* Income breakdown + Bills & due dates */}
                <div className="ov-grid-2">
                    {/*
                       Income breakdown — sources of income this month.
                       TODO: connect to backend (no income-source procedure
                       yet); using dummy data.
                    */}
                    <IncomeBreakdownCard
                        totalIncome={summary.data?.periodIncome ?? 0}
                    />
                    {/*
                       Bills & due dates — upcoming bills in next 14 days.
                       TODO: connect to backend (no bills feature yet);
                       using dummy data.
                    */}
                    <BillsCard upcomingEvents={upcomingEvents} />
                </div>

                {/*
                   Subscriptions & recurring — auto-detected services.
                   TODO: connect to backend (no recurring-detection feature
                   yet); using dummy data.
                */}
                <SubscriptionsGrid />

                {/* Accounts at a glance + Top merchants */}
                <div className="ov-grid-2">
                    <AccountsGlance
                        accounts={accountDistribution.data ?? []}
                        loading={accountDistribution.isLoading}
                        spaceId={space.id}
                        isPersonal={isPersonal}
                    />
                    {/*
                       Top merchants — biggest merchants this month.
                       TODO: connect to backend (no merchant aggregation
                       yet); using dummy data.
                    */}
                    <TopMerchants />
                </div>
            </div>
        </div>
    );
});

/* =============================================================
   Helper components
   ============================================================= */

function Money({
    amount,
    variant = "neutral",
    signed = false,
    size = 13,
    weight = 500,
    decimals = 2,
}: {
    amount: number;
    variant?: "neutral" | "income" | "expense" | "transfer" | "muted" | "warn" | "gold" | "brand";
    signed?: boolean;
    size?: number;
    weight?: number;
    decimals?: number;
}) {
    const colorMap: Record<string, string> = {
        income: "var(--income)",
        expense: "var(--expense)",
        transfer: "var(--transfer)",
        warn: "var(--warn)",
        muted: "var(--fg-3)",
        gold: "var(--gold)",
        brand: "var(--brand)",
        neutral: "var(--fg)",
    };
    const abs = Math.abs(amount).toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
    let text = abs;
    if (amount < 0) text = "−" + abs;
    else if (signed && amount > 0) text = "+" + abs;
    return (
        <span
            className="tabular"
            style={{ color: colorMap[variant], fontSize: size, fontWeight: weight }}
        >
            {text}
        </span>
    );
}

const SPACE_ICONS: ReadonlyArray<string> = ["home", "briefcase", "terminal", "book"];
const SPACE_COLORS: ReadonlyArray<string> = [
    "var(--ent-1)",
    "var(--ent-3)",
    "var(--ent-4)",
    "var(--ent-2)",
    "var(--ent-5)",
    "var(--ent-6)",
];

function PersonalSpaceBand({
    data,
}: {
    data: {
        personalBalance: number;
        spaces: Array<{
            id: string;
            name: string;
            memberCount: number;
            myRole: "owner" | "editor" | "viewer";
            balance: number;
        }>;
        total: number;
    };
}) {
    const cells: Array<{
        kind: "personal" | "space";
        id: string;
        name: string;
        sub: string;
        balance: number;
        color: string;
        icon: string;
        share?: string;
    }> = [
        {
            kind: "personal" as const,
            id: "__personal",
            name: "Personal-only",
            sub: "Accounts only you own",
            balance: data.personalBalance,
            color: "var(--gold)",
            icon: "sparkle",
        },
        ...data.spaces.map((s, i) => ({
            kind: "space" as const,
            id: s.id,
            name: s.name,
            sub: `Shared · ${s.memberCount} member${s.memberCount === 1 ? "" : "s"}`,
            balance: s.balance,
            color: SPACE_COLORS[i % SPACE_COLORS.length]!,
            icon: SPACE_ICONS[i % SPACE_ICONS.length]!,
            share: `1/${s.memberCount}`,
        })),
    ].filter((c) => c.balance !== 0 || c.kind === "personal");

    const total = data.total || 1; // avoid /0

    return (
        <div className="od-card ov-personal-band">
            <span className="ov-personal-band-glow" aria-hidden />
            <div className="ov-personal-band-head">
                <div className="ov-personal-band-headline">
                    <span className="ov-personal-band-icon">
                        <DesignIcon name="sparkle" size={14} color="var(--gold)" />
                    </span>
                    <div>
                        <div className="ov-personal-band-title">
                            Across {data.spaces.length} space
                            {data.spaces.length === 1 ? "" : "s"}
                        </div>
                        <div className="ov-personal-band-sub">
                            Your share of every space you&apos;re in, plus accounts
                            only you own.
                        </div>
                    </div>
                </div>
                <Link to={ROUTES.spaces} className="ov-personal-band-link">
                    Manage spaces →
                </Link>
            </div>

            {/* Stacked proportion bar */}
            <div className="ov-personal-band-bar" aria-hidden>
                {cells.map((c) => {
                    const pct = total > 0 ? (c.balance / total) * 100 : 0;
                    if (pct <= 0) return null;
                    return (
                        <span
                            key={c.id}
                            style={{
                                width: `${pct}%`,
                                background: c.color,
                                opacity: c.kind === "personal" ? 1 : 0.85,
                            }}
                        />
                    );
                })}
            </div>

            {/* Per-bucket cards */}
            <div className="ov-personal-band-grid">
                {cells.map((c) => {
                    const pct = total > 0 ? (c.balance / total) * 100 : 0;
                    const target =
                        c.kind === "personal"
                            ? ROUTES.myAccounts
                            : ROUTES.space(c.id);
                    return (
                        <Link
                            key={c.id}
                            to={target}
                            className="ov-personal-band-cell"
                        >
                            <div className="ov-personal-band-cell-head">
                                <span className="ov-personal-band-cell-name">
                                    <EntityAvatar
                                        icon={c.icon}
                                        colorVar={c.color}
                                        size={22}
                                    />
                                    <span className="ov-personal-band-cell-label">
                                        {c.name}
                                    </span>
                                </span>
                                {c.share && (
                                    <span className="ov-personal-band-chip">
                                        your {c.share}
                                    </span>
                                )}
                            </div>
                            <div className="ov-personal-band-cell-foot">
                                <Money amount={c.balance} size={15} weight={500} />
                                <span className="ov-personal-band-pct">
                                    {pct.toFixed(0)}%
                                </span>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

function StatTile({
    label,
    amount,
    variant = "fg",
    delta,
    icon,
    accent,
    loading,
    signed,
}: {
    label: string;
    amount: number;
    variant?: "fg" | "income" | "expense";
    delta?: ReactNode;
    icon?: ReactNode;
    accent?: string;
    loading?: boolean;
    signed?: boolean;
}) {
    return (
        <div className="od-card ov-stat-tile">
            {accent && (
                <span
                    className="ov-stat-accent"
                    style={{
                        background: `radial-gradient(80% 80% at 100% 0%, ${accent}, transparent 60%)`,
                    }}
                />
            )}
            <div className="ov-stat-head">
                <span className="ov-stat-label">{label}</span>
                {icon && <span className="ov-stat-icon">{icon}</span>}
            </div>
            <div className="ov-stat-amount">
                {loading ? (
                    <Skeleton width={140} height={28} />
                ) : (
                    <Money
                        amount={amount}
                        size={26}
                        weight={500}
                        variant={variant === "fg" ? "neutral" : variant}
                        signed={signed && variant === "income"}
                    />
                )}
            </div>
            {delta && <div className="ov-stat-delta">{delta}</div>}
        </div>
    );
}

function SectionHead({
    title,
    sub,
    action,
}: {
    title: ReactNode;
    sub?: ReactNode;
    action?: ReactNode;
}) {
    return (
        <div className="ov-sect-head">
            <div className="ov-sect-text">
                <h2 className="display ov-sect-title">{title}</h2>
                {sub && <span className="ov-sect-sub">{sub}</span>}
            </div>
            {action}
        </div>
    );
}

function EntityAvatar({
    icon,
    colorVar,
    size = 32,
}: {
    icon: string;
    colorVar: string;
    size?: number;
}) {
    return (
        <span
            className="ov-avatar"
            style={{
                width: size,
                height: size,
                color: colorVar,
                background: `color-mix(in oklab, ${colorVar} 18%, transparent)`,
                border: `1px solid color-mix(in oklab, ${colorVar} 30%, transparent)`,
            }}
        >
            <DesignIcon name={icon} size={size * 0.5} color={colorVar} />
        </span>
    );
}

function ProgressBar({
    value,
    color = "var(--brand)",
    height = 6,
}: {
    value: number;
    color?: string;
    height?: number;
}) {
    const clamped = Math.max(0, Math.min(1.5, value));
    const over = clamped > 1;
    return (
        <div
            className="ov-progress"
            style={{
                height,
                borderRadius: 999,
                background: "var(--bg-elev-3)",
                overflow: "hidden",
                position: "relative",
            }}
        >
            <div
                style={{
                    height: "100%",
                    width: `${Math.min(clamped, 1) * 100}%`,
                    background: over ? "var(--expense)" : color,
                    borderRadius: 999,
                    transition: "width 600ms cubic-bezier(0.2,0.7,0.2,1)",
                }}
            />
        </div>
    );
}

function Skeleton({ width, height = 16 }: { width?: number | string; height?: number }) {
    return (
        <div
            style={{
                width: width ?? "100%",
                height,
                borderRadius: 6,
                background:
                    "linear-gradient(90deg, var(--bg-elev-1), var(--bg-elev-2), var(--bg-elev-1))",
                backgroundSize: "200% 100%",
                animation: "ov-shimmer 1.6s ease-in-out infinite",
            }}
        />
    );
}

function EmptyHint({ children, compact }: { children: ReactNode; compact?: boolean }) {
    return (
        <div
            style={{
                fontSize: 13,
                color: "var(--fg-3)",
                padding: compact ? "12px 0" : "24px 0",
                textAlign: "center",
            }}
        >
            {children}
        </div>
    );
}

/* ---------- Charts ---------- */

function BalanceTrend({ series }: { series: Array<{ bucket: string; balance: number }> }) {
    if (series.length === 0) return null;
    const first = series[0]!.balance;
    const last = series[series.length - 1]!.balance;
    const delta = last - first;
    const firstBucket = series[0]!.bucket;
    return (
        <>
            <div className="ov-trend-kpis">
                <KpiCol label={formatInAppTz(firstBucket, "MMM d")} amount={first} />
                <KpiCol label="Today" amount={last} />
                <KpiCol
                    label="Change"
                    amount={delta}
                    variant={delta >= 0 ? "income" : "expense"}
                    signed
                />
            </div>
            <AreaChart series={series} height={210} />
        </>
    );
}

function KpiCol({
    label,
    amount,
    variant = "neutral",
    signed,
}: {
    label: string;
    amount: number;
    variant?: "neutral" | "income" | "expense";
    signed?: boolean;
}) {
    return (
        <div>
            <div className="ov-kpi-eyebrow">{label}</div>
            <Money amount={amount} size={16} weight={500} variant={variant} signed={signed} />
        </div>
    );
}

/**
 * Hand-rolled area chart with mouse-tracking hover. Uses two distinct
 * hues (warm gold line + cool green fill) to mirror the editorial
 * treatment from the Balance history detail view. On hover, snaps a
 * vertical guide + dot to the nearest data point and shows a tooltip
 * with the date and value at that point — recharts is overkill for the
 * overview's small chart and brings in extra bundle weight we don't
 * need here.
 */
function AreaChart({
    series,
    height = 200,
    /** Base color for stroke and end-dot — warm gold by default. */
    lineColor = "oklch(82% 0.16 95)",
    /** Base color for the area gradient — cooler green by default. */
    fillColor = "oklch(60% 0.16 145)",
}: {
    series: Array<{ bucket: string; balance: number }>;
    height?: number;
    lineColor?: string;
    fillColor?: string;
}) {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);

    if (series.length < 2)
        return <EmptyHint>Not enough points yet.</EmptyHint>;

    const w = 800;
    const h = height;
    const p = 12;
    const data = series.map((d) => d.balance);
    const max = Math.max(...data);
    const min = Math.min(...data);
    const sx = (i: number) => p + (i / (data.length - 1)) * (w - p * 2);
    const sy = (v: number) =>
        h - p - ((v - min) / (max - min || 1)) * (h - p * 2);
    const path = data
        .map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`)
        .join(" ");
    const area = `${path} L ${sx(data.length - 1)} ${h - p} L ${p} ${h - p} Z`;
    const lastIdx = data.length - 1;

    const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
        // Translate cursor x into a `viewBox` x coord, then snap to the
        // closest data point. Tracked on the wrapping div (not the SVG)
        // so the SVG can keep `preserveAspectRatio="none"` and stretch
        // horizontally without the math going off — we use the wrapper's
        // bounding rect to remap.
        const rect = e.currentTarget.getBoundingClientRect();
        const xRatio = (e.clientX - rect.left) / Math.max(1, rect.width);
        if (xRatio < 0 || xRatio > 1) {
            setHoverIdx(null);
            return;
        }
        const xInChart = p + xRatio * (w - p * 2);
        const i = Math.round(((xInChart - p) / (w - p * 2)) * lastIdx);
        const clamped = Math.max(0, Math.min(lastIdx, i));
        setHoverIdx(clamped);
    };

    const active = hoverIdx ?? lastIdx;
    const activeX = sx(active);
    const activeY = sy(data[active]!);
    const tooltipPctLeft = (activeX / w) * 100;

    return (
        <div
            onMouseMove={onMove}
            onMouseLeave={() => setHoverIdx(null)}
            style={{ position: "relative" }}
        >
            <svg
                viewBox={`0 0 ${w} ${h}`}
                width="100%"
                height={h}
                preserveAspectRatio="none"
                style={{ display: "block" }}
            >
                <defs>
                    <linearGradient
                        id="ov-area-grad"
                        x1="0"
                        x2="0"
                        y1="0"
                        y2="1"
                    >
                        <stop
                            offset="0%"
                            stopColor={fillColor}
                            stopOpacity="0.5"
                        />
                        <stop
                            offset="100%"
                            stopColor={fillColor}
                            stopOpacity="0"
                        />
                    </linearGradient>
                </defs>
                {[0, 1, 2, 3].map((i) => (
                    <line
                        key={i}
                        x1={p}
                        x2={w - p}
                        y1={p + (i * (h - p * 2)) / 3}
                        y2={p + (i * (h - p * 2)) / 3}
                        stroke="var(--line-soft, var(--border))"
                        strokeDasharray="2 4"
                    />
                ))}
                <path d={area} fill="url(#ov-area-grad)" />
                <path d={path} fill="none" stroke={lineColor} strokeWidth="1.6" />

                {/* Hover guide + dot */}
                {hoverIdx !== null && (
                    <>
                        <line
                            x1={activeX}
                            x2={activeX}
                            y1={p}
                            y2={h - p}
                            stroke={lineColor}
                            strokeOpacity={0.4}
                            strokeDasharray="3 4"
                        />
                        <circle
                            cx={activeX}
                            cy={activeY}
                            r="7"
                            fill={lineColor}
                            opacity="0.22"
                        />
                        <circle
                            cx={activeX}
                            cy={activeY}
                            r="3.5"
                            fill={lineColor}
                        />
                    </>
                )}

                {/* End-point marker (only when not hovering somewhere else) */}
                {hoverIdx === null && (
                    <>
                        <circle
                            cx={sx(lastIdx)}
                            cy={sy(data[lastIdx]!)}
                            r="7"
                            fill={lineColor}
                            opacity="0.18"
                        />
                        <circle
                            cx={sx(lastIdx)}
                            cy={sy(data[lastIdx]!)}
                            r="3.5"
                            fill={lineColor}
                        />
                    </>
                )}
            </svg>

            {/* Tooltip — absolutely positioned over the wrapper. Pointer
                events disabled so it doesn't steal hover from the SVG;
                left clamps to keep the bubble fully on-screen near the
                edges. */}
            {hoverIdx !== null && (
                <div
                    style={{
                        position: "absolute",
                        top: 8,
                        left: `${Math.max(4, Math.min(96, tooltipPctLeft))}%`,
                        transform: "translateX(-50%)",
                        pointerEvents: "none",
                        background: "var(--popover, var(--background))",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "6px 10px",
                        fontSize: 11,
                        lineHeight: 1.3,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                        whiteSpace: "nowrap",
                        zIndex: 1,
                    }}
                >
                    <div
                        style={{
                            color: "var(--muted-foreground, #888)",
                            fontSize: 10,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            marginBottom: 2,
                        }}
                    >
                        {formatInAppTz(series[active]!.bucket, "MMM d, yyyy")}
                    </div>
                    <Money amount={data[active]!} size={13} weight={600} />
                </div>
            )}
        </div>
    );
}

function CashFlow({
    data,
}: {
    data: Array<{ bucket: string; income: number; expense: number }>;
}) {
    if (data.length === 0) return null;
    const w = 800;
    const h = 200;
    const p = 18;
    const n = data.length;
    const max = Math.max(...data.map((d) => Math.max(d.income, d.expense))) || 1;
    const slot = (w - p * 2) / n;
    const bw = Math.max(3, slot / 2 - 4);
    const sx = (i: number) => p + i * slot;
    const sy = (v: number) => h - p - 12 - (v / max) * (h - p * 2 - 12);
    return (
        <svg
            viewBox={`0 0 ${w} ${h}`}
            width="100%"
            height={h}
            style={{ display: "block" }}
        >
            {[0, 1, 2, 3].map((i) => (
                <line
                    key={i}
                    x1={p}
                    x2={w - p}
                    y1={p + (i * (h - p * 2 - 12)) / 3}
                    y2={p + (i * (h - p * 2 - 12)) / 3}
                    stroke="var(--line-soft)"
                    strokeDasharray="2 4"
                />
            ))}
            {data.map((d, i) => {
                const incomeH = d.income > 0 ? Math.max(3, h - p - 12 - sy(d.income)) : 0;
                const expenseH = d.expense > 0 ? Math.max(3, h - p - 12 - sy(d.expense)) : 0;
                return (
                    <g key={i}>
                        {incomeH > 0 && (
                            <rect
                                x={sx(i) + 4}
                                y={h - p - 12 - incomeH}
                                width={bw}
                                height={incomeH}
                                fill="var(--income)"
                                opacity="0.85"
                                rx="2"
                            />
                        )}
                        {expenseH > 0 && (
                            <rect
                                x={sx(i) + 4 + bw + 3}
                                y={h - p - 12 - expenseH}
                                width={bw}
                                height={expenseH}
                                fill="var(--expense)"
                                opacity="0.85"
                                rx="2"
                            />
                        )}
                        <text
                            x={sx(i) + slot / 2}
                            y={h - 4}
                            fontSize="9.5"
                            fill="var(--fg-4)"
                            textAnchor="middle"
                            style={{ letterSpacing: "0.04em" }}
                        >
                            {formatInAppTz(d.bucket, "MMM d")}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

function DonutCard({
    title,
    sub,
    action,
    slices,
    centerLabel,
    centerValue,
    loading,
}: {
    title: ReactNode;
    sub?: ReactNode;
    action?: ReactNode;
    slices: Array<{ id: string; name: string; value: number; color: string }>;
    centerLabel: string;
    centerValue: string;
    loading?: boolean;
}) {
    const total = slices.reduce((s, x) => s + x.value, 0);
    return (
        <div className="od-card ov-section ov-donut-card">
            <SectionHead title={title} sub={sub} action={action} />
            {loading ? (
                <Skeleton height={200} />
            ) : slices.length === 0 ? (
                <EmptyHint>No data yet.</EmptyHint>
            ) : (
                <>
                    <div className="ov-donut-wrap">
                        <Donut
                            slices={slices}
                            size={180}
                            thickness={20}
                            label={centerLabel}
                            value={centerValue}
                        />
                    </div>
                    <div className="ov-donut-legend">
                        {slices.slice(0, 6).map((r) => {
                            const pct = total > 0 ? (r.value / total) * 100 : 0;
                            return (
                                <div key={r.id} className="ov-donut-legend-row">
                                    <span className="ov-donut-legend-name">
                                        <span
                                            className="ov-donut-dot"
                                            style={{ background: r.color }}
                                        />
                                        <span className="ov-donut-text">{r.name}</span>
                                    </span>
                                    <span className="ov-donut-legend-val">
                                        <Money amount={r.value} size={12} />
                                        <span className="ov-donut-pct">{pct.toFixed(0)}%</span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

function Donut({
    slices,
    size = 180,
    label,
    value,
    thickness = 14,
}: {
    slices: Array<{ value: number; color: string }>;
    size?: number;
    label: string;
    value: string;
    thickness?: number;
}) {
    const r = (size - thickness) / 2;
    const c = 2 * Math.PI * r;
    const total = slices.reduce((s, x) => s + x.value, 0) || 1;
    let acc = 0;
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="var(--bg-elev-3)"
                strokeWidth={thickness}
            />
            {slices.map((s, i) => {
                const len = (s.value / total) * c;
                const off = c - acc;
                acc += len;
                return (
                    <circle
                        key={i}
                        cx={size / 2}
                        cy={size / 2}
                        r={r}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={thickness}
                        strokeDasharray={`${len} ${c - len}`}
                        strokeDashoffset={off}
                        transform={`rotate(-90 ${size / 2} ${size / 2})`}
                        strokeLinecap="butt"
                    />
                );
            })}
            <text
                x="50%"
                y="46%"
                textAnchor="middle"
                fill="var(--fg-3)"
                fontSize="10"
                letterSpacing="1.2"
                style={{ textTransform: "uppercase" }}
            >
                {label}
            </text>
            <text
                x="50%"
                y="58%"
                textAnchor="middle"
                fill="var(--fg)"
                fontSize="18"
                fontWeight="500"
                style={{ fontVariantNumeric: "tabular-nums", fontFamily: "Geist, sans-serif" }}
            >
                {value}
            </text>
        </svg>
    );
}

function renderDelta(delta: number | null, dir: "higher-better" | "lower-better"): ReactNode {
    if (delta == null) return null;
    if (delta === Infinity) return "New vs last month";
    if (delta === 0) return "No change";
    const good = dir === "higher-better" ? delta > 0 : delta < 0;
    const sign = delta > 0 ? "+" : "−";
    const color = good ? "var(--income)" : "var(--expense)";
    return (
        <span style={{ color }}>
            {sign}
            {Math.abs(delta).toFixed(0)}% vs March
        </span>
    );
}

function formatShort(n: number): string {
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/* ---------- Inline icons ---------- */
const ICON_PATHS: Record<string, string> = {
    home: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
    wallet: "M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1h2v8h-2v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm14 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
    cart: "M3 4h2l3 12h11l2-8H7M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    car: "M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13m-14 0v5h2v-2h10v2h2v-5m-14 0h14M7 16h.01M17 16h.01",
    book: "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM4 17a3 3 0 0 1 3-3h11",
    flame: "M12 22s7-4 7-10c0-3-2-5-3-6 0 2-1 3-2 3-1-3-3-5-3-7-2 1-6 5-6 10 0 6 7 10 7 10z",
    bolt: "M13 2 3 14h7l-1 8 10-12h-7z",
    coffee: "M5 8h12v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zm12 1h2a2 2 0 1 1 0 4h-2zM7 4v2M11 4v2M15 4v2",
    layers: "m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5M3 17l9 5 9-5",
    target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-4a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    calendar: "M5 5h14v14H5zM5 9h14M9 3v4M15 3v4",
    chart: "M3 21V3m18 18H3m4-4 4-6 4 4 6-8",
    plus: "M12 5v14M5 12h14",
    trendUp: "M3 17 9 11 13 15 21 7M14 7h7v7",
    trendDown: "M3 7 9 13 13 9 21 17M14 17h7v-7",
    flag: "M4 21v-7M4 4h13l-2 4 2 4H4",
    list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    filter: "M3 5h18l-7 9v6l-4-2v-4z",
    chevronRight: "m9 6 6 6-6 6",
    arrowUp: "M12 19V5m-7 7 7-7 7 7",
    arrowDown: "M12 5v14m7-7-7 7-7-7",
    share: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4m4-4v13",
    music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zm11-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3z",
    camera: "M3 8h4l2-3h6l2 3h4v11H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
};

function DesignIcon({
    name,
    size = 14,
    color = "currentColor",
}: {
    name: string;
    size?: number;
    color?: string;
}) {
    const d = ICON_PATHS[name] ?? ICON_PATHS.layers;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d={d} />
        </svg>
    );
}

const TrendUpIcon = ({ color = "currentColor" }: { color?: string }) => (
    <DesignIcon name="trendUp" size={13} color={color} />
);
const TrendDownIcon = ({ color = "currentColor" }: { color?: string }) => (
    <DesignIcon name="trendDown" size={13} color={color} />
);
const LayersIcon = ({ color = "currentColor" }: { color?: string }) => (
    <DesignIcon name="layers" size={13} color={color} />
);
const WalletIcon = () => <DesignIcon name="wallet" size={13} color="var(--fg-4)" />;
const CartIcon = ({ color = "currentColor" }: { color?: string }) => (
    <DesignIcon name="cart" size={13} color={color} />
);
const FlagIcon = ({ color = "currentColor" }: { color?: string }) => (
    <DesignIcon name="flag" size={13} color={color} />
);
const TargetIcon = ({ color = "currentColor" }: { color?: string }) => (
    <DesignIcon name="target" size={13} color={color} />
);
const FilterIcon = () => <DesignIcon name="filter" size={13} color="var(--fg-3)" />;
const ChartIcon = () => <DesignIcon name="chart" size={13} color="var(--fg-3)" />;
const PlusIcon = () => <DesignIcon name="plus" size={13} color="var(--brand-fg)" />;
const BoltIcon = () => <DesignIcon name="bolt" size={16} color="var(--warn)" />;
const ChevronRightIcon = () => <DesignIcon name="chevronRight" size={13} color="var(--fg-4)" />;

/* =============================================================
   New (design-driven) components
   ============================================================= */

/** Section eyebrow — small label + subtitle separating big page bands. */
function SectionEyebrow({ label, sub }: { label: string; sub: string }) {
    return (
        <div className="ov-section-eyebrow">
            <span className="eyebrow">{label}</span>
            <span className="ov-section-eyebrow-sub">· {sub}</span>
        </div>
    );
}

/** Today band — quick-glance daily summary at the very top.
 *  TODO(api): no daily-bucket procedure yet; values are dummy. */
function TodayBand({ now }: { now: Date }) {
    const cells: Array<{ label: string; value: ReactNode; tone?: string }> = [
        {
            label: "Today",
            value: (
                <span style={{ color: "var(--fg-2)" }}>
                    {formatInAppTz(now, "MMM d")}
                </span>
            ),
        },
        {
            label: "Net today",
            value: <Money amount={185.24} variant="income" size={13} signed />,
        },
        { label: "Transactions", value: <span className="tabular">4</span> },
        {
            label: "Cleared",
            value: <span className="tabular" style={{ color: "var(--income)" }}>3</span>,
        },
        {
            label: "Pending",
            value: <span className="tabular" style={{ color: "var(--warn)" }}>1</span>,
        },
        {
            label: "Last sync",
            value: <span style={{ color: "var(--fg-3)" }}>2m ago</span>,
        },
    ];
    return (
        <div className="od-card ov-today-band">
            {cells.map((c, i) => (
                <div key={c.label} className="ov-today-cell">
                    <span className="ov-today-label">{c.label}</span>
                    <span className="ov-today-value">{c.value}</span>
                    {i < cells.length - 1 && <span className="ov-today-divider" />}
                </div>
            ))}
        </div>
    );
}

/** Net worth composition — assets minus liabilities, with horizontal
 *  split bars. Built from accountDistribution. */
function NetWorthComposition({
    accounts,
    loading,
}: {
    accounts: Array<{
        accountId: string;
        name: string;
        accountType: "asset" | "liability" | "locked";
        color: string;
        balance: number;
    }>;
    loading?: boolean;
}) {
    const assets = accounts.filter(
        (a) => a.accountType === "asset" || a.accountType === "locked"
    );
    const liabs = accounts.filter((a) => a.accountType === "liability");
    const assetTotal = assets.reduce((s, x) => s + x.balance, 0);
    const liabTotal = liabs.reduce((s, x) => s + x.balance, 0);
    const net = assetTotal - liabTotal;

    return (
        <div className="od-card ov-section ov-nwc">
            <SectionHead
                title={
                    <>
                        <LayersIcon color="var(--brand)" /> Net worth composition
                    </>
                }
                sub="Assets minus liabilities · 12-month trend"
                action={
                    <a className="ov-details-link" href="#">
                        Open breakdown →
                    </a>
                }
            />
            {loading ? (
                <Skeleton height={140} />
            ) : (
                <div className="ov-nwc-body">
                    <div className="ov-nwc-numbers">
                        <div className="ov-stat-eyebrow">Net worth</div>
                        <div className="ov-nwc-net">
                            <Money amount={net} size={32} weight={500} />
                        </div>
                        {/* TODO(api): YoY delta — needs historical net worth */}
                        <div
                            style={{
                                fontSize: 11.5,
                                color: "var(--income)",
                                marginTop: 2,
                            }}
                        >
                            +21.5% YoY · +<Money amount={31800} size={11.5} variant="income" />
                        </div>
                        <div className="ov-nwc-pair">
                            <div>
                                <div className="ov-stat-eyebrow">Assets</div>
                                <Money
                                    amount={assetTotal}
                                    size={14}
                                    weight={500}
                                    variant="income"
                                />
                            </div>
                            <div>
                                <div className="ov-stat-eyebrow">Liabilities</div>
                                <Money
                                    amount={liabTotal}
                                    size={14}
                                    weight={500}
                                    variant="expense"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="ov-nwc-bars">
                        {/* TODO(api): replace fake mini-trend with real
                           12-month net-worth series once available. */}
                        <div className="ov-nwc-trendwrap">
                            <AreaChart
                                series={[
                                    1, 1.05, 1.1, 1.08, 1.15, 1.18, 1.22, 1.2,
                                    1.28, 1.32, 1.38, 1.45,
                                ].map((v, i) => ({
                                    // Synthesize one bucket per month over
                                    // the trailing 12 months so the hover
                                    // tooltip can render a date label even
                                    // though the trend itself is fake.
                                    bucket: addMonths(
                                        new Date(),
                                        -11 + i
                                    ).toISOString(),
                                    balance: v * Math.max(net, 1),
                                }))}
                                height={120}
                            />
                        </div>
                        <NwcSplitBar
                            label={`Assets · ${formatShort(assetTotal)}`}
                            badge="Composition"
                            items={assets}
                            total={assetTotal}
                        />
                        <NwcSplitBar
                            label={`Liabilities · ${formatShort(liabTotal)}`}
                            items={liabs}
                            total={liabTotal}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function NwcSplitBar({
    label,
    badge,
    items,
    total,
}: {
    label: string;
    badge?: string;
    items: Array<{ accountId: string; name: string; balance: number; color: string }>;
    total: number;
}) {
    return (
        <div className="ov-nwc-split">
            <div className="ov-nwc-split-head">
                <span className="ov-stat-eyebrow">{label}</span>
                {badge && <span className="ov-stat-eyebrow">{badge}</span>}
            </div>
            <div className="ov-nwc-split-bar">
                {items.map((it) => {
                    const pct = total > 0 ? (it.balance / total) * 100 : 0;
                    if (pct <= 0) return null;
                    return (
                        <span
                            key={it.accountId}
                            style={{ width: `${pct}%`, background: it.color }}
                        />
                    );
                })}
            </div>
            <div className="ov-nwc-split-legend">
                {items.slice(0, 6).map((it) => {
                    const pct = total > 0 ? (it.balance / total) * 100 : 0;
                    return (
                        <span key={it.accountId} className="ov-nwc-split-legend-cell">
                            <span
                                className="ov-donut-dot"
                                style={{ background: it.color }}
                            />
                            <span style={{ color: "var(--fg-2)" }}>{it.name}</span>
                            <span style={{ color: "var(--fg-4)" }}>
                                · {pct.toFixed(0)}%
                            </span>
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

/** Daily spend heatmap — calendar grid with darkness = spend intensity. */
function DailyHeatmap({
    now,
    data,
    loading,
}: {
    now: Date;
    data: Array<{ day: Date; total: number }>;
    loading?: boolean;
}) {
    const monthLabel = formatInAppTz(now, "MMMM yyyy");
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sun
    const today = now.getDate();

    const byDay = new Map<number, number>();
    for (const r of data) {
        const d = new Date(r.day);
        if (d.getMonth() === month) byDay.set(d.getDate(), r.total);
    }
    const max = Math.max(0, ...Array.from(byDay.values()));
    const totalMonth = Array.from(byDay.values()).reduce((s, x) => s + x, 0);
    const noSpendDays = Array.from({ length: today }, (_, i) => i + 1).filter(
        (d) => !byDay.has(d) || byDay.get(d) === 0
    ).length;
    let peakDay: number | null = null;
    let peakAmt = 0;
    for (const [d, v] of byDay) {
        if (v > peakAmt) {
            peakAmt = v;
            peakDay = d;
        }
    }

    /* Build a calendar grid: leading empties + days. 7 cols. */
    const cells: Array<{ d: number | null; v: number }> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ d: null, v: 0 });
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push({ d, v: byDay.get(d) ?? 0 });
    }
    while (cells.length % 7 !== 0) cells.push({ d: null, v: 0 });

    return (
        <div className="od-card ov-section ov-heatmap">
            <SectionHead
                title={
                    <>
                        <DesignIcon name="calendar" size={13} color="var(--gold)" /> Daily
                        spend heatmap
                    </>
                }
                sub={`${monthLabel} · darker = more spent`}
                action={
                    <a className="ov-details-link" href="#">
                        Open calendar →
                    </a>
                }
            />
            {loading ? (
                <Skeleton height={240} />
            ) : (
                <>
                    <div className="ov-heatmap-grid">
                        {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
                            <span key={i} className="ov-heatmap-weekday">
                                {w}
                            </span>
                        ))}
                        {cells.map((c, i) => {
                            const intensity =
                                max > 0 && c.v > 0 ? Math.min(1, c.v / max) : 0;
                            const isToday = c.d === today;
                            const isFuture = c.d != null && c.d > today;
                            const isPlaceholder = c.d == null;
                            return (
                                <div
                                    key={i}
                                    className={`ov-heatmap-cell${isToday ? " is-today" : ""}${isFuture ? " is-future" : ""}${isPlaceholder ? " is-empty" : ""}`}
                                    style={{
                                        background: isPlaceholder
                                            ? "transparent"
                                            : isFuture
                                              ? "var(--bg-elev-2)"
                                              : `color-mix(in oklab, var(--gold) ${intensity * 70}%, var(--bg-elev-2))`,
                                    }}
                                >
                                    {c.d != null && (
                                        <>
                                            <span className="ov-heatmap-dnum">{c.d}</span>
                                            {c.v > 0 && (
                                                <span className="ov-heatmap-damt">
                                                    {formatThousands(c.v)}
                                                </span>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="ov-heatmap-foot">
                        <div>
                            <div className="ov-stat-eyebrow">This month</div>
                            <Money amount={totalMonth} size={14} weight={500} />
                        </div>
                        <div>
                            <div className="ov-stat-eyebrow">No-spend days</div>
                            <span
                                className="tabular"
                                style={{
                                    fontSize: 14,
                                    color: "var(--income)",
                                    fontWeight: 500,
                                }}
                            >
                                {noSpendDays}
                            </span>
                        </div>
                        <div>
                            <div className="ov-stat-eyebrow">Peak day</div>
                            {peakDay ? (
                                <span style={{ fontSize: 14 }}>
                                    {formatInAppTz(
                                        new Date(year, month, peakDay),
                                        "MMM d"
                                    )}{" "}
                                    ·{" "}
                                    <Money
                                        amount={peakAmt}
                                        size={14}
                                        weight={500}
                                        variant="expense"
                                    />
                                </span>
                            ) : (
                                <span style={{ fontSize: 14, color: "var(--fg-4)" }}>—</span>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function formatThousands(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return Math.round(n).toString();
}

/** Top movers — biggest week-over-week category shifts.
 *  TODO(api): connect once a category-WoW procedure exists. */
function TopMovers() {
    const rows = [
        { name: "Entertainment", icon: "flame", color: "var(--ent-6)", cur: 145, prev: 60 },
        { name: "Coffee", icon: "coffee", color: "var(--ent-7)", cur: 128, prev: 84 },
        {
            name: "Transportation",
            icon: "car",
            color: "var(--ent-3)",
            cur: 95,
            prev: 178,
        },
        { name: "Dining out", icon: "flame", color: "var(--ent-6)", cur: 410, prev: 280 },
        { name: "Groceries", icon: "cart", color: "var(--ent-2)", cur: 320, prev: 410 },
        {
            name: "Subscriptions",
            icon: "music",
            color: "var(--ent-7)",
            cur: 62,
            prev: 62,
        },
    ];
    const max = Math.max(...rows.flatMap((r) => [r.cur, r.prev]));
    return (
        <div className="od-card ov-section ov-movers">
            <SectionHead
                title={
                    <>
                        <DesignIcon name="repeat" size={13} color="var(--brand)" /> Top
                        movers
                    </>
                }
                sub="Biggest week-over-week shifts"
                action={
                    <a className="ov-details-link" href="#">
                        View all →
                    </a>
                }
            />
            <div className="ov-list-col">
                {rows.map((r) => {
                    const pct = r.prev > 0 ? ((r.cur - r.prev) / r.prev) * 100 : 0;
                    const isUp = r.cur > r.prev;
                    const isDown = r.cur < r.prev;
                    const arrow = isUp ? "▲" : isDown ? "▼" : "•";
                    const tone = isUp
                        ? "var(--expense)"
                        : isDown
                          ? "var(--income)"
                          : "var(--fg-3)";
                    return (
                        <div key={r.name} className="ov-mover-row">
                            <EntityAvatar icon={r.icon} colorVar={r.color} size={26} />
                            <div className="ov-mover-text">
                                <div className="ov-mover-name">{r.name}</div>
                                <div className="ov-mover-bar">
                                    <span
                                        style={{
                                            width: `${(r.cur / max) * 100}%`,
                                            background: r.color,
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="ov-mover-amt">
                                <Money amount={r.cur} size={11.5} />{" "}
                                <span style={{ color: "var(--fg-4)", fontSize: 10.5 }}>
                                    vs <Money amount={r.prev} size={10.5} variant="muted" />
                                </span>
                            </div>
                            <div
                                className="ov-mover-delta"
                                style={{ color: tone, fontSize: 12, fontWeight: 500 }}
                            >
                                {arrow} {Math.abs(pct).toFixed(0)}%
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** Spending trends — cumulative spend curve + projection.
 *  TODO(api): connect to backend (no cumulative procedure yet). */
function SpendingTrends({
    monthProgress,
    monthExpense,
    lastMonthExpense,
}: {
    monthProgress: { elapsed: number; total: number };
    monthExpense: number;
    lastMonthExpense: number;
}) {
    const totalDays = monthProgress.total || 30;
    const elapsed = monthProgress.elapsed || 1;
    /* Build a fake cumulative shape that lands at monthExpense on `elapsed`. */
    const thisMonth = Array.from({ length: elapsed }, (_, i) => {
        const t = (i + 1) / elapsed;
        return monthExpense * (0.3 * t + 0.7 * t * t);
    });
    const lastMonth = Array.from({ length: totalDays }, (_, i) => {
        const t = (i + 1) / totalDays;
        return lastMonthExpense * t;
    });
    const projection = Array.from(
        { length: totalDays - elapsed + 1 },
        (_, i) => {
            const dayRate = monthExpense / Math.max(1, elapsed);
            return monthExpense + dayRate * i;
        }
    );
    const projectedTotal = projection[projection.length - 1] ?? monthExpense;
    const dayAvg = monthExpense / Math.max(1, elapsed);
    const paceDelta =
        lastMonthExpense > 0
            ? ((projectedTotal - lastMonthExpense) / lastMonthExpense) * 100
            : 0;

    return (
        <div className="od-card ov-section ov-trends">
            <SectionHead
                title={
                    <>
                        <DesignIcon name="chart" size={13} color="var(--gold)" /> Spending
                        trends
                    </>
                }
                sub={`Day ${elapsed} of ${totalDays} · cumulative spend vs last month`}
                action={
                    <a className="ov-details-link" href="#">
                        Open view →
                    </a>
                }
            />
            <div className="ov-trends-body">
                <div className="ov-trends-chart">
                    <TrendsChart
                        thisMonth={thisMonth}
                        lastMonth={lastMonth}
                        projection={projection}
                        elapsed={elapsed}
                        totalDays={totalDays}
                    />
                    <div className="ov-trends-legend">
                        <span>
                            <span
                                style={{
                                    width: 14,
                                    height: 2,
                                    background: "var(--gold)",
                                    display: "inline-block",
                                    verticalAlign: "middle",
                                    marginRight: 4,
                                }}
                            />
                            This month
                        </span>
                        <span>
                            <span
                                style={{
                                    width: 14,
                                    height: 2,
                                    borderTop: "1px dashed var(--fg-3)",
                                    display: "inline-block",
                                    verticalAlign: "middle",
                                    marginRight: 4,
                                }}
                            />
                            Last month
                        </span>
                        <span>
                            <span
                                style={{
                                    width: 14,
                                    height: 2,
                                    borderTop: "1px dotted var(--gold)",
                                    display: "inline-block",
                                    verticalAlign: "middle",
                                    marginRight: 4,
                                }}
                            />
                            Projection
                        </span>
                    </div>
                </div>
                <div className="ov-trends-stats">
                    <div className="od-card ov-trends-stat">
                        <div className="ov-stat-eyebrow">Spent so far</div>
                        <div className="ov-trends-stat-amt">
                            <Money amount={monthExpense} size={26} weight={500} />
                        </div>
                        <div className="ov-trends-stat-sub">
                            Day {elapsed} ·{" "}
                            <Money amount={dayAvg} size={11.5} variant="muted" />
                            /day avg
                        </div>
                    </div>
                    <div className="od-card ov-trends-stat">
                        <div className="ov-stat-eyebrow">Projected month</div>
                        <div className="ov-trends-stat-amt">
                            <Money amount={projectedTotal} size={26} weight={500} />
                        </div>
                        <div className="ov-trends-stat-sub">
                            vs <Money amount={lastMonthExpense} size={11.5} variant="muted" />{" "}
                            last month
                        </div>
                    </div>
                    <div className="od-card ov-trends-stat">
                        <div className="ov-stat-eyebrow">Pace ahead</div>
                        <div
                            className="ov-trends-stat-amt"
                            style={{ color: paceDelta > 0 ? "var(--expense)" : "var(--income)" }}
                        >
                            {paceDelta >= 0 ? "+" : "−"}
                            {Math.abs(paceDelta).toFixed(1)}
                            <span style={{ fontSize: 16 }}>%</span>
                        </div>
                        <div className="ov-trends-stat-sub">
                            % {paceDelta > 0 ? "faster" : "slower"} than last month
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function TrendsChart({
    thisMonth,
    lastMonth,
    projection,
    elapsed,
    totalDays,
}: {
    thisMonth: number[];
    lastMonth: number[];
    projection: number[];
    elapsed: number;
    totalDays: number;
}) {
    const w = 800;
    const h = 220;
    const p = 18;
    const max = Math.max(
        1,
        ...thisMonth,
        ...lastMonth,
        ...projection
    );
    const sx = (i: number) => p + (i / Math.max(1, totalDays - 1)) * (w - p * 2);
    const sy = (v: number) => h - p - (v / max) * (h - p * 2);
    const path = (arr: number[], offset = 0) =>
        arr
            .map((v, i) => `${i ? "L" : "M"}${sx(i + offset).toFixed(1)} ${sy(v).toFixed(1)}`)
            .join(" ");
    return (
        <svg
            viewBox={`0 0 ${w} ${h}`}
            width="100%"
            height={h}
            preserveAspectRatio="none"
            style={{ display: "block" }}
        >
            <defs>
                <linearGradient id="ov-trends-grad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
                </linearGradient>
            </defs>
            {/* This month area */}
            <path
                d={`${path(thisMonth)} L ${sx(thisMonth.length - 1)} ${h - p} L ${p} ${h - p} Z`}
                fill="url(#ov-trends-grad)"
            />
            {/* Last month dashed */}
            <path
                d={path(lastMonth)}
                fill="none"
                stroke="var(--fg-3)"
                strokeWidth="1.2"
                strokeDasharray="4 4"
                opacity="0.7"
            />
            {/* Projection dotted */}
            <path
                d={path(projection, elapsed - 1)}
                fill="none"
                stroke="var(--gold)"
                strokeWidth="1.3"
                strokeDasharray="2 4"
                opacity="0.85"
            />
            {/* This month line */}
            <path
                d={path(thisMonth)}
                fill="none"
                stroke="var(--gold)"
                strokeWidth="1.8"
            />
            {/* Today marker */}
            <circle
                cx={sx(elapsed - 1)}
                cy={sy(thisMonth[thisMonth.length - 1] ?? 0)}
                r="4"
                fill="var(--gold)"
            />
        </svg>
    );
}

/** Income breakdown — sources of income. TODO(api): no source breakdown. */
function IncomeBreakdownCard({ totalIncome }: { totalIncome: number }) {
    const total = totalIncome > 0 ? totalIncome : 13209;
    const sources = [
        { name: "Salary · Acme Corp", sub: "Bi-weekly · 2 of 2", v: 9800, c: "var(--income)" },
        { name: "Freelance — Design", sub: "1 invoice paid", v: 2200, c: "var(--ent-2)" },
        { name: "Dividends", sub: "Q1 distribution", v: 340, c: "var(--ent-3)" },
        { name: "Reimbursements", sub: "2 expense reports", v: 580, c: "var(--ent-4)" },
        { name: "Cashback", sub: "Card rewards", v: 289, c: "var(--ent-5)" },
    ];
    return (
        <div className="od-card ov-section ov-income">
            <SectionHead
                title={
                    <>
                        <DesignIcon name="arrowDown" size={13} color="var(--income)" /> Income
                        breakdown
                    </>
                }
                sub="Where money came from this month"
                action={
                    <a className="ov-details-link" href="#">
                        Details →
                    </a>
                }
            />
            <div className="ov-income-headline">
                <Money amount={total} size={26} weight={500} variant="income" signed />
                <span className="ov-income-sub">across {sources.length} sources</span>
            </div>
            <div className="ov-income-bar">
                {sources.map((s) => {
                    const pct = (s.v / total) * 100;
                    return (
                        <span
                            key={s.name}
                            style={{ width: `${pct}%`, background: s.c }}
                        />
                    );
                })}
            </div>
            <div className="ov-list-col" style={{ gap: 10 }}>
                {sources.map((s) => {
                    const pct = (s.v / total) * 100;
                    return (
                        <div key={s.name} className="ov-income-row">
                            <span
                                className="ov-donut-dot"
                                style={{ background: s.c }}
                            />
                            <div className="ov-income-row-text">
                                <div className="ov-income-row-name">{s.name}</div>
                                <div className="ov-income-row-sub">{s.sub}</div>
                            </div>
                            <Money amount={s.v} size={13} variant="income" signed />
                            <span className="ov-income-row-pct">{pct.toFixed(0)}%</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** Bills & due dates — upcoming bills next 14 days. TODO(api): no bills feature. */
function BillsCard({
    upcomingEvents,
}: {
    upcomingEvents: Array<{
        id: string;
        name: string;
        color: string;
        icon: string;
        start_time: string;
    }>;
}) {
    const dummy = [
        { id: "b1", name: "Rent", sub: "May 01 · in 7d", v: 1550, kind: "auto", icon: "home", color: "var(--ent-1)" },
        { id: "b2", name: "Electricity · ConEd", sub: "Apr 28 · in 4d", v: 142, kind: "auto", icon: "bolt", color: "var(--ent-7)" },
        { id: "b3", name: "Internet · Verizon", sub: "Apr 27 · in 3d", v: 89, kind: "manual", icon: "wifi", color: "var(--ent-3)" },
        { id: "b4", name: "Sapphire Card", sub: "May 03 · in 9d", v: 720, kind: "manual", icon: "wallet", color: "var(--ent-6)" },
        { id: "b5", name: "Auto loan", sub: "May 05 · in 11d", v: 385, kind: "auto", icon: "car", color: "var(--ent-3)" },
        { id: "b6", name: "Phone · T-Mobile", sub: "May 08 · in 14d", v: 75, kind: "auto", icon: "phone", color: "var(--ent-2)" },
    ];
    const due7 = dummy.slice(0, 2).reduce((s, x) => s + x.v, 0);
    const total = dummy.reduce((s, x) => s + x.v, 0);
    void upcomingEvents; // events feature isn't wired to bills yet
    return (
        <div className="od-card ov-section ov-bills">
            <SectionHead
                title={
                    <>
                        <DesignIcon name="bell" size={13} color="var(--gold)" /> Bills & due
                        dates
                    </>
                }
                sub="Next 14 days"
                action={
                    <span className="ov-bills-totals">
                        <span>
                            due in 7d <Money amount={due7} size={12} variant="warn" />
                        </span>
                        <span>
                            · total <Money amount={total} size={12} />
                        </span>
                    </span>
                }
            />
            <div className="ov-list-col" style={{ gap: 10 }}>
                {dummy.map((b) => (
                    <div key={b.id} className="ov-bill-row">
                        <EntityAvatar
                            icon={b.icon}
                            colorVar={b.color}
                            size={28}
                        />
                        <span className="ov-bill-sub">
                            <span className="ov-bill-date">{b.sub.split(" · ")[0]}</span>
                            <span className="ov-bill-when">{b.sub.split(" · ")[1]}</span>
                        </span>
                        <span className="ov-bill-name">{b.name}</span>
                        <span className={`ov-chip ov-chip-${b.kind === "auto" ? "income" : "transfer"}`}>
                            {b.kind}
                        </span>
                        <Money amount={b.v} size={13} variant="warn" />
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Subscriptions & recurring — auto-detected services grid.
 *  TODO(api): no recurring detection yet. */
function SubscriptionsGrid() {
    const subs = [
        { id: "s1", name: "Netflix", sub: "monthly · next Apr 28", v: 17.99, icon: "film", color: "var(--ent-6)" },
        { id: "s2", name: "Spotify Family", sub: "monthly · next May 02", v: 16.99, icon: "music", color: "var(--ent-7)" },
        { id: "s3", name: "iCloud+ 2 TB", sub: "monthly · next May 04", v: 9.99, icon: "layers", color: "var(--ent-3)" },
        { id: "s4", name: "Adobe Creative", sub: "monthly · next May 11", v: 54.99, icon: "edit", color: "var(--ent-4)" },
        { id: "s5", name: "Gym membership", sub: "monthly · next May 01", v: 49, icon: "dumbbell", color: "var(--ent-2)" },
        { id: "s6", name: "ChatGPT Plus", sub: "monthly · next May 09", v: 20, icon: "command", color: "var(--ent-4)" },
        { id: "s7", name: "AAA Roadside", sub: "annual · next Jun 02", v: 12.5, icon: "shield", color: "var(--ent-3)" },
        { id: "s8", name: "NYT Digital", sub: "monthly · next May 06", v: 6, icon: "book", color: "var(--ent-1)" },
    ];
    const monthly = subs
        .filter((s) => s.sub.startsWith("monthly"))
        .reduce((sum, x) => sum + x.v, 0);
    const annualized = subs.reduce(
        (sum, x) => sum + (x.sub.startsWith("monthly") ? x.v * 12 : x.v),
        0
    );
    return (
        <div className="od-card ov-section ov-subs">
            <SectionHead
                title={
                    <>
                        <DesignIcon name="repeat" size={13} color="var(--ent-3)" /> Subscriptions
                        &amp; recurring
                    </>
                }
                sub={`${subs.length} active services · auto-detected from ledger`}
                action={
                    <span className="ov-subs-totals">
                        <span>
                            monthly{" "}
                            <Money amount={monthly} size={12} weight={500} />
                        </span>
                        <span>
                            · annualized{" "}
                            <Money amount={annualized} size={12} weight={500} />
                        </span>
                        <a className="ov-details-link" href="#">
                            Manage →
                        </a>
                    </span>
                }
            />
            <div className="ov-subs-grid">
                {subs.map((s) => (
                    <div key={s.id} className="ov-sub-cell">
                        <EntityAvatar icon={s.icon} colorVar={s.color} size={32} />
                        <div className="ov-sub-text">
                            <div className="ov-sub-name">{s.name}</div>
                            <div className="ov-sub-sub">{s.sub}</div>
                        </div>
                        <Money amount={s.v} size={13} weight={500} />
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Accounts at a glance — list of accounts with 7-day micro-trends.
 *  Real data via accountDistribution; sparklines are dummy until we
 *  add a per-account 7-day balance series query. */
function AccountsGlance({
    accounts,
    loading,
    spaceId,
    isPersonal,
}: {
    accounts: Array<{
        accountId: string;
        name: string;
        accountType: "asset" | "liability" | "locked";
        color: string;
        icon?: string;
        balance: number;
    }>;
    loading?: boolean;
    spaceId: string;
    isPersonal: boolean;
}) {
    return (
        <div className="od-card ov-section ov-glance">
            <SectionHead
                title={
                    <>
                        <DesignIcon name="wallet" size={13} color="var(--brand)" /> Accounts at
                        a glance
                    </>
                }
                sub="Live balances · 7-day micro-trend"
                action={
                    <Link
                        to={isPersonal ? ROUTES.myAccounts : ROUTES.spaceAccounts(spaceId)}
                        className="ov-details-link"
                    >
                        All accounts →
                    </Link>
                }
            />
            {loading ? (
                <div className="ov-list-col">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} height={36} />
                    ))}
                </div>
            ) : accounts.length === 0 ? (
                <EmptyHint compact>No accounts yet.</EmptyHint>
            ) : (
                <div className="ov-list-col" style={{ gap: 14 }}>
                    {accounts.slice(0, 5).map((a, i) => {
                        /* TODO(api): real 7-day balance series per account. */
                        const series = fakeSeries(a.balance, i);
                        const liability = a.accountType === "liability";
                        const delta = (series[series.length - 1]! - series[0]!) / Math.max(1, series[0]!) * 100;
                        return (
                            <div key={a.accountId} className="ov-glance-row">
                                <EntityAvatar
                                    icon={a.icon ?? "wallet"}
                                    colorVar={a.color}
                                    size={28}
                                />
                                <div className="ov-glance-text">
                                    <div className="ov-glance-name">{a.name}</div>
                                    <div className="ov-glance-id">·· {a.accountId.slice(-4)}</div>
                                </div>
                                <div className="ov-glance-spark">
                                    <Sparkline
                                        data={series}
                                        color={
                                            liability ? "var(--expense)" : "var(--income)"
                                        }
                                    />
                                </div>
                                <span
                                    className="tabular"
                                    style={{
                                        fontSize: 11,
                                        color: delta >= 0 ? "var(--income)" : "var(--expense)",
                                    }}
                                >
                                    {delta >= 0 ? "+" : "−"}
                                    {Math.abs(delta).toFixed(1)}%
                                </span>
                                <Money
                                    amount={liability ? -a.balance : a.balance}
                                    size={13}
                                    weight={500}
                                />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function fakeSeries(end: number, seed: number): number[] {
    /* Deterministic faux-trend based on `seed` so it's stable per account. */
    const start = end * (0.94 + ((seed * 13) % 7) / 100);
    const arr: number[] = [];
    for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const noise = Math.sin(seed + i) * 0.005 * end;
        arr.push(start + (end - start) * t + noise);
    }
    return arr;
}

function Sparkline({
    data,
    color = "var(--brand)",
}: {
    data: number[];
    color?: string;
}) {
    if (data.length < 2) return null;
    const w = 80;
    const h = 22;
    const p = 1;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const sx = (i: number) => p + (i / (data.length - 1)) * (w - p * 2);
    const sy = (v: number) =>
        h - p - ((v - min) / (max - min || 1)) * (h - p * 2);
    const path = data
        .map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`)
        .join(" ");
    return (
        <svg
            viewBox={`0 0 ${w} ${h}`}
            width={w}
            height={h}
            style={{ display: "block" }}
        >
            <path d={path} fill="none" stroke={color} strokeWidth="1.4" />
        </svg>
    );
}

/** Top merchants — biggest merchants this month. TODO(api): no merchant agg. */
function TopMerchants() {
    const rows = [
        { name: "Whole Foods Market", icon: "cart", color: "var(--ent-2)", txns: 9, v: 612.4, delta: 18 },
        { name: "Shell Gas Station", icon: "car", color: "var(--ent-3)", txns: 6, v: 284.15, delta: -4 },
        { name: "Blue Bottle Coffee", icon: "coffee", color: "var(--ent-7)", txns: 14, v: 187.5, delta: -32 },
        { name: "Amazon", icon: "shopping-bag", color: "var(--ent-5)", txns: 11, v: 462.8, delta: -21 },
        { name: "Galaxy Cinema", icon: "flame", color: "var(--ent-6)", txns: 4, v: 156, delta: 50 },
        { name: "Daily Basket", icon: "cart", color: "var(--ent-2)", txns: 5, v: 98.2, delta: -8 },
    ];
    const max = Math.max(...rows.map((r) => r.v));
    return (
        <div className="od-card ov-section ov-merchants">
            <SectionHead
                title={
                    <>
                        <DesignIcon name="hash" size={13} color="var(--ent-5)" /> Top
                        merchants
                    </>
                }
                sub="Where money went this month"
                action={
                    <a className="ov-details-link" href="#">
                        View all →
                    </a>
                }
            />
            <div className="ov-list-col" style={{ gap: 12 }}>
                {rows.map((r) => {
                    const isUp = r.delta > 0;
                    return (
                        <div key={r.name} className="ov-merchant-row">
                            <EntityAvatar
                                icon={r.icon}
                                colorVar={r.color}
                                size={26}
                            />
                            <div className="ov-merchant-text">
                                <div className="ov-merchant-name">{r.name}</div>
                                <div className="ov-merchant-bar">
                                    <span
                                        style={{
                                            width: `${(r.v / max) * 100}%`,
                                            background: r.color,
                                        }}
                                    />
                                </div>
                            </div>
                            <span className="ov-merchant-meta">{r.txns} txns</span>
                            <Money amount={r.v} size={13} weight={500} />
                            <span
                                className="tabular"
                                style={{
                                    fontSize: 11,
                                    color: isUp ? "var(--expense)" : "var(--income)",
                                }}
                            >
                                {isUp ? "▲" : "▼"} {Math.abs(r.delta)}%
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* =============================================================
   Styles — scoped to .ov-root inside .orbit-design
   ============================================================= */
const OV_STYLES = `
.ov-root {
    /* Cancel SpaceLayout's outer padding so the editorial topbar can sit
       flush against the sidebar / mobile-header edges. */
    margin: -1.5rem -1rem;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
}
@media (min-width: 768px) {
    .ov-root { margin: -2rem; }
}

.ov-root @keyframes ov-shimmer {
    0%   { background-position: 100% 0; }
    100% { background-position: -100% 0; }
}
@keyframes ov-shimmer {
    0%   { background-position: 100% 0; }
    100% { background-position: -100% 0; }
}

/* Topbar */
.ov-topbar {
    padding: 26px 32px 18px;
    border-bottom: 1px solid var(--line-soft);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    background: var(--bg);
    flex-wrap: wrap;
}
.ov-topbar-text { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ov-title {
    font-size: 26px;
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--fg);
    margin: 0;
}
.ov-sub { font-size: 13px; color: var(--fg-3); margin: 0; }
.ov-topbar-actions {
    display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
}
.ov-link-btn { text-decoration: none; }

/* Scroll body */
.ov-scroll {
    flex: 1;
    padding: 22px 32px 36px;
    display: flex;
    flex-direction: column;
    gap: 18px;
}
@media (max-width: 720px) {
    .ov-topbar { padding: 18px 18px 14px; }
    .ov-scroll { padding: 16px 18px 28px; }
}

/* Section heading */
.ov-sect-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    margin-bottom: 14px;
    gap: 12px;
    flex-wrap: wrap;
}
/* The text block stacks title + subtitle vertically. Without this the
   subtitle would inline next to the title (h2 is inline-flex). */
.ov-sect-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}
.ov-sect-title {
    font-size: 16px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--fg);
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
}
.ov-sect-sub { font-size: 12px; color: var(--fg-3); }

.ov-section { padding: 22px; }

.ov-details-link {
    font-size: 12px;
    color: var(--fg-3);
    text-decoration: none;
    padding: 4px 8px;
    border-radius: 6px;
    transition: color 140ms ease, background 140ms ease;
}
.ov-details-link:hover { color: var(--fg); background: var(--bg-elev-2); }

/* Stat row */
.ov-stat-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
}
@media (max-width: 1100px) {
    .ov-stat-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.ov-stat-tile {
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    position: relative;
    overflow: hidden;
}
.ov-stat-accent {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.5;
}
.ov-stat-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: relative;
}
.ov-stat-label {
    font-size: 10px;
    color: var(--fg-4);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 500;
}
.ov-stat-icon { color: var(--fg-4); display: inline-flex; }
.ov-stat-amount { position: relative; }
.ov-stat-delta { font-size: 11px; color: var(--fg-3); position: relative; }

/* Personal-only "across spaces" band */
.orbit-design .od-card.ov-personal-band {
    padding: 18px;
    position: relative;
    overflow: hidden;
    border-color: color-mix(in oklab, var(--gold) 22%, var(--line));
    background: color-mix(in oklab, var(--gold) 4%, var(--bg-elev-1));
}
.ov-personal-band-glow {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(70% 60% at 0% 0%, var(--gold-soft), transparent 60%);
}
.ov-personal-band-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
    position: relative;
    flex-wrap: wrap;
}
.ov-personal-band-headline {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}
.ov-personal-band-icon {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: color-mix(in oklab, var(--gold) 22%, transparent);
    border: 1px solid color-mix(in oklab, var(--gold) 35%, transparent);
    color: var(--gold);
    display: grid;
    place-items: center;
    flex-shrink: 0;
}
.ov-personal-band-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--fg);
}
.ov-personal-band-sub {
    font-size: 11.5px;
    color: var(--fg-3);
}
.ov-personal-band-link {
    font-size: 12px;
    color: var(--fg-3);
    text-decoration: none;
    padding: 4px 8px;
    border-radius: 6px;
    transition: color 140ms ease, background 140ms ease;
}
.ov-personal-band-link:hover {
    color: var(--fg);
    background: var(--bg-elev-2);
}
.ov-personal-band-bar {
    display: flex;
    height: 8px;
    border-radius: 999px;
    overflow: hidden;
    margin-bottom: 14px;
    position: relative;
    background: var(--bg-elev-3);
}
.ov-personal-band-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    position: relative;
}
@media (max-width: 1100px) {
    .ov-personal-band-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
    .ov-personal-band-grid { grid-template-columns: 1fr; }
}
.ov-personal-band-cell {
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line-soft);
    display: flex;
    flex-direction: column;
    gap: 8px;
    cursor: pointer;
    text-decoration: none;
    color: inherit;
    transition: border-color 140ms ease, background 140ms ease;
}
.ov-personal-band-cell:hover {
    border-color: var(--line-strong);
    background: var(--bg-elev-3);
}
.ov-personal-band-cell-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}
.ov-personal-band-cell-name {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.ov-personal-band-cell-label {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ov-personal-band-chip {
    height: 18px;
    font-size: 9.5px;
    padding: 0 6px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--bg-elev-1);
    border: 1px solid var(--line);
    color: var(--fg-3);
    flex-shrink: 0;
}
.ov-personal-band-cell-foot {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
}
.ov-personal-band-pct {
    font-size: 10.5px;
    color: var(--fg-4);
    font-variant-numeric: tabular-nums;
}

/* Drift / over-allocation banners.
   The selector is doubled (.od-card.ov-*) so it beats the global
   .orbit-design .od-card rule (specificity 0,2,0) — otherwise the
   default card background overrides the warm tint and the banner
   reads as a plain dark card with no amber/red signal. */
.orbit-design .od-card.ov-drift {
    padding: 18px;
    border-color: color-mix(in oklab, var(--warn) 35%, var(--line));
    background: color-mix(in oklab, var(--warn) 6%, var(--bg-elev-1));
}
.orbit-design .od-card.ov-over {
    padding: 18px;
    border-color: color-mix(in oklab, var(--expense) 35%, var(--line));
    background: color-mix(in oklab, var(--expense) 6%, var(--bg-elev-1));
}
.ov-drift-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
}
.ov-drift-headline { display: flex; gap: 14px; min-width: 0; }
.ov-drift-icon {
    width: 36px; height: 36px;
    border-radius: 10px;
    background: var(--warn-soft);
    color: var(--warn);
    display: grid; place-items: center;
    flex-shrink: 0;
}
.ov-over-icon {
    background: var(--expense-soft);
    color: var(--expense);
}
.ov-drift-title { font-size: 13.5px; color: var(--fg); font-weight: 500; }
.ov-drift-sub { font-size: 12px; color: var(--fg-3); margin-top: 2px; }
.ov-drift-rows {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.ov-drift-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line-soft);
    border-radius: 10px;
    text-decoration: none;
    color: inherit;
    transition: border-color 140ms ease;
}
.ov-drift-row:hover { border-color: var(--line-strong); }
.ov-drift-row-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.ov-drift-row-name { font-size: 13px; color: var(--fg); }
.ov-drift-row-acct { font-size: 11.5px; color: var(--fg-4); }
.ov-drift-row-right { display: flex; align-items: center; gap: 12px; }

/* Donut trio */
.ov-trio {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
}
.ov-trio-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (max-width: 1100px) {
    .ov-trio,
    .ov-trio-2 { grid-template-columns: 1fr; }
}
.ov-donut-card { display: flex; flex-direction: column; gap: 16px; }
.ov-donut-wrap { display: flex; justify-content: center; }
.ov-donut-legend { display: flex; flex-direction: column; gap: 8px; }
.ov-donut-legend-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
}
.ov-donut-legend-name {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--fg-2);
    min-width: 0;
}
.ov-donut-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ov-donut-dot {
    width: 7px;
    height: 7px;
    border-radius: 99px;
    flex-shrink: 0;
}
.ov-donut-legend-val {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
}
.ov-donut-pct {
    font-size: 10.5px;
    color: var(--fg-4);
    font-variant-numeric: tabular-nums;
    width: 32px;
    text-align: right;
}

/* Trend KPI row */
.ov-trend-kpis {
    display: grid;
    grid-template-columns: auto auto auto 1fr;
    gap: 28px;
    align-items: center;
    margin-bottom: 12px;
}
.ov-kpi-eyebrow {
    font-size: 10.5px;
    color: var(--fg-4);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 4px;
}

/* Cash flow legend */
.ov-cf-legend {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
}
.ov-legend-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: var(--fg-3);
}
.ov-legend-chip > span:first-child {
    width: 8px; height: 8px; border-radius: 2px;
}

/* Month progress strip */
.ov-progress-strip {
    padding: 16px 22px;
    display: flex;
    align-items: center;
    gap: 22px;
    flex-wrap: wrap;
}
.ov-progress-bar { flex: 1; min-width: 240px; }
.ov-progress-bar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}
.ov-progress-label { font-size: 12.5px; color: var(--fg); font-weight: 500; }
.ov-progress-meta { font-size: 11px; color: var(--fg-4); letter-spacing: 0.04em; }
.ov-progress-stats { display: flex; gap: 24px; flex-wrap: wrap; }
.ov-stat-eyebrow {
    font-size: 10px;
    color: var(--fg-4);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 2px;
}

/* Two-column grids */
.ov-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
}
.ov-grid-7-5 {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 14px;
}
.ov-grid-full {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
}
@media (max-width: 1100px) {
    .ov-grid-2,
    .ov-grid-7-5 { grid-template-columns: 1fr; }
}

/* List rows (envelopes / plans) */
.ov-list-col { display: flex; flex-direction: column; gap: 14px; }
.ov-list-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-decoration: none;
    color: inherit;
    padding: 4px;
    margin: -4px;
    border-radius: 8px;
    transition: background 140ms ease;
}
.ov-list-row:hover { background: var(--bg-elev-2); }
.ov-list-row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}
.ov-list-row-name {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    color: var(--fg);
    min-width: 0;
}
.ov-list-row-amt {
    font-size: 11.5px;
    color: var(--fg-3);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

/* Avatars */
.ov-avatar {
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

/* Chips */
.ov-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    background: var(--bg-elev-2);
    border: 1px solid var(--line);
    color: var(--fg-2);
    text-transform: capitalize;
}
.ov-chip-drift {
    height: 18px;
    font-size: 10px;
    color: var(--expense);
    border-color: color-mix(in oklab, var(--expense) 30%, transparent);
    background: transparent;
}
.ov-chip-income {
    color: var(--income);
    border-color: color-mix(in oklab, var(--income) 30%, transparent);
    background: transparent;
    height: 20px;
    font-size: 9.5px;
    padding: 0 7px;
}
.ov-chip-expense {
    color: var(--expense);
    border-color: color-mix(in oklab, var(--expense) 30%, transparent);
    background: transparent;
    height: 20px;
    font-size: 9.5px;
    padding: 0 7px;
}
.ov-chip-transfer {
    color: var(--transfer);
    border-color: color-mix(in oklab, var(--transfer) 30%, transparent);
    background: transparent;
    height: 20px;
    font-size: 9.5px;
    padding: 0 7px;
}

/* Transactions list */
.ov-tx-list { display: flex; flex-direction: column; }
.ov-tx-row {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    align-items: center;
    gap: 14px;
    padding: 11px 0;
}
.ov-tx-date {
    font-size: 11px;
    color: var(--fg-4);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
    width: 44px;
}
.ov-tx-desc {
    font-size: 13px;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}

/* Events */
.ov-events-col { display: flex; flex-direction: column; gap: 12px; }
.ov-event {
    padding: 12px;
    border-radius: 10px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line-soft);
}
.ov-event-head { display: flex; align-items: center; gap: 10px; }
.ov-event-text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
}
.ov-event-name { font-size: 13px; font-weight: 500; color: var(--fg); }
.ov-event-date { font-size: 11px; color: var(--fg-4); }

/* ===== Section eyebrows (POSITION / COMPOSITION / FLOW / etc.) ===== */
.ov-section-eyebrow {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 8px 4px 4px;
}
.ov-section-eyebrow-sub {
    font-size: 11px;
    color: var(--fg-4);
    letter-spacing: 0.04em;
}

/* ===== Today band ===== */
.orbit-design .od-card.ov-today-band {
    padding: 16px 22px;
    display: flex;
    align-items: center;
    gap: 0;
    overflow-x: auto;
    background: linear-gradient(
        90deg,
        color-mix(in oklab, var(--brand) 6%, var(--bg-elev-1)) 0%,
        var(--bg-elev-1) 80%
    );
    border-color: color-mix(in oklab, var(--brand) 18%, var(--line));
}
.ov-today-cell {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 22px;
    position: relative;
    flex: 1;
    min-width: 120px;
}
.ov-today-cell:first-child { padding-left: 0; }
.ov-today-cell:last-child { padding-right: 0; }
.ov-today-divider {
    position: absolute;
    right: 0;
    top: 4px;
    bottom: 4px;
    width: 1px;
    background: var(--line-soft);
}
.ov-today-label {
    font-size: 10px;
    color: var(--fg-4);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 500;
    flex-shrink: 0;
}
.ov-today-value {
    font-size: 13px;
    color: var(--fg);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* ===== Net worth composition ===== */
.ov-nwc { padding: 22px; }
.ov-nwc-body {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 24px;
    align-items: start;
}
@media (max-width: 900px) {
    .ov-nwc-body { grid-template-columns: 1fr; }
}
.ov-nwc-numbers { display: flex; flex-direction: column; gap: 4px; }
.ov-nwc-net { font-size: 32px; font-weight: 500; line-height: 1; color: var(--fg); margin: 4px 0 2px; }
.ov-nwc-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--line-soft);
}
.ov-nwc-bars { display: flex; flex-direction: column; gap: 12px; }
.ov-nwc-trendwrap { padding-bottom: 8px; }
.ov-nwc-split { display: flex; flex-direction: column; gap: 6px; }
.ov-nwc-split-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.ov-nwc-split-bar {
    display: flex;
    height: 10px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--bg-elev-3);
}
.ov-nwc-split-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    font-size: 11px;
}
.ov-nwc-split-legend-cell {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

/* ===== Daily spend heatmap ===== */
.ov-heatmap-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
}
.ov-heatmap-weekday {
    font-size: 10.5px;
    color: var(--fg-4);
    text-align: center;
    padding: 4px 0;
    letter-spacing: 0.06em;
}
.ov-heatmap-cell {
    aspect-ratio: 1.2;
    min-height: 56px;
    border-radius: 10px;
    border: 1px solid var(--line-soft);
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    transition: border-color 140ms ease;
    color: var(--fg-2);
}
.ov-heatmap-cell.is-today {
    border-color: var(--brand);
    box-shadow: 0 0 0 1px var(--brand-soft) inset;
}
.ov-heatmap-cell.is-future {
    color: var(--fg-4);
    opacity: 0.55;
}
.ov-heatmap-cell.is-empty {
    border: 1px dashed var(--line-soft);
    background: transparent !important;
}
.ov-heatmap-dnum {
    font-size: 10.5px;
    color: var(--fg-3);
    font-variant-numeric: tabular-nums;
}
.ov-heatmap-damt {
    font-size: 10px;
    color: var(--fg-4);
    text-align: right;
    font-variant-numeric: tabular-nums;
}
.ov-heatmap-foot {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--line-soft);
    display: flex;
    gap: 32px;
    flex-wrap: wrap;
}

/* ===== Top movers ===== */
.ov-mover-row {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    align-items: center;
    gap: 12px;
}
.ov-mover-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--fg);
}
.ov-mover-bar {
    height: 4px;
    border-radius: 999px;
    background: var(--bg-elev-3);
    overflow: hidden;
    margin-top: 4px;
}
.ov-mover-bar > span {
    display: block;
    height: 100%;
    border-radius: 999px;
}
.ov-mover-amt {
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
}
.ov-mover-delta {
    text-align: right;
    min-width: 60px;
    white-space: nowrap;
}

/* ===== Spending trends ===== */
.ov-trends-body {
    display: grid;
    grid-template-columns: 1fr 220px;
    gap: 18px;
    align-items: stretch;
}
@media (max-width: 1100px) {
    .ov-trends-body { grid-template-columns: 1fr; }
}
.ov-trends-chart {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.ov-trends-legend {
    display: flex;
    gap: 18px;
    font-size: 11px;
    color: var(--fg-3);
    flex-wrap: wrap;
}
.ov-trends-stats {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.orbit-design .od-card.ov-trends-stat {
    padding: 14px 16px;
    background: var(--bg-elev-2);
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.ov-trends-stat-amt {
    font-size: 26px;
    font-weight: 500;
    line-height: 1;
    color: var(--fg);
}
.ov-trends-stat-sub { font-size: 11px; color: var(--fg-4); }

/* ===== Income breakdown ===== */
.ov-income-headline {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 12px;
}
.ov-income-sub { font-size: 12px; color: var(--fg-3); }
.ov-income-bar {
    display: flex;
    height: 8px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--bg-elev-3);
    margin-bottom: 12px;
}
.ov-income-row {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    align-items: center;
    gap: 12px;
}
.ov-income-row-text { min-width: 0; }
.ov-income-row-name {
    font-size: 13px;
    color: var(--fg);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ov-income-row-sub {
    font-size: 11px;
    color: var(--fg-4);
}
.ov-income-row-pct {
    font-size: 11px;
    color: var(--fg-4);
    font-variant-numeric: tabular-nums;
    width: 28px;
    text-align: right;
}

/* ===== Bills & due dates ===== */
.ov-bills-totals {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    font-size: 11px;
    color: var(--fg-3);
    letter-spacing: 0.04em;
}
.ov-bill-row {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
    align-items: center;
    gap: 12px;
}
.ov-bill-sub {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    min-width: 60px;
}
.ov-bill-date {
    font-size: 11px;
    color: var(--warn);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
}
.ov-bill-when { font-size: 10px; color: var(--fg-4); }
.ov-bill-name {
    font-size: 13px;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* ===== Subscriptions grid ===== */
.ov-subs-totals {
    display: inline-flex;
    gap: 12px;
    font-size: 11px;
    color: var(--fg-3);
    align-items: center;
    flex-wrap: wrap;
}
.ov-subs-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
}
@media (max-width: 1100px) {
    .ov-subs-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 600px) {
    .ov-subs-grid { grid-template-columns: 1fr; }
}
.ov-sub-cell {
    padding: 12px;
    border-radius: 10px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line-soft);
    display: flex;
    align-items: center;
    gap: 10px;
}
.ov-sub-text {
    flex: 1;
    min-width: 0;
}
.ov-sub-name {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ov-sub-sub {
    font-size: 10.5px;
    color: var(--fg-4);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* ===== Accounts at a glance ===== */
.ov-glance-row {
    display: grid;
    grid-template-columns: auto 1fr auto auto auto;
    align-items: center;
    gap: 14px;
}
.ov-glance-text { min-width: 0; }
.ov-glance-name {
    font-size: 13px;
    color: var(--fg);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ov-glance-id {
    font-size: 11px;
    color: var(--fg-4);
    font-variant-numeric: tabular-nums;
}
.ov-glance-spark { width: 80px; height: 22px; }

/* ===== Top merchants ===== */
.ov-merchant-row {
    display: grid;
    grid-template-columns: auto 1fr auto auto auto;
    align-items: center;
    gap: 12px;
}
.ov-merchant-text { min-width: 0; }
.ov-merchant-name {
    font-size: 13px;
    color: var(--fg);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ov-merchant-bar {
    height: 4px;
    border-radius: 999px;
    background: var(--bg-elev-3);
    overflow: hidden;
    margin-top: 4px;
}
.ov-merchant-bar > span {
    display: block;
    height: 100%;
    border-radius: 999px;
}
.ov-merchant-meta {
    font-size: 11px;
    color: var(--fg-4);
}
`;
