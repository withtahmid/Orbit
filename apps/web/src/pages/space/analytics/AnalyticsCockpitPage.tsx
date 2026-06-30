import { lazy, Suspense, useMemo } from "react";
import { GranularityStepper } from "@/components/shared/GranularityStepper";
import { MetricToggle, useMetricMode } from "@/components/shared/MetricMode";
import { KpiStrip, type KpiItem } from "@/components/shared/KpiStrip";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import {
    useCockpitState,
    COCKPIT_TABS,
    type CockpitTab,
} from "@/hooks/useCockpitState";
import { getAppTzYear, trailingMonthWindow } from "@/lib/dates";
import { trpc } from "@/trpc";
import { cn } from "@/lib/utils";
import { CockpitProvider, useCockpit, type CockpitValue } from "./CockpitContext";

const OverviewTab = lazy(() => import("./tabs/OverviewTab"));
const CashFlowTab = lazy(() => import("./tabs/CashFlowTab"));
const SpendingTab = lazy(() => import("./tabs/SpendingTab"));
const AccountsTab = lazy(() => import("./tabs/AccountsTab"));
const BudgetTab = lazy(() => import("./tabs/BudgetTab"));
const InsightsTab = lazy(() => import("./tabs/InsightsTab"));

const TAB_COMPONENTS: Record<CockpitTab, React.LazyExoticComponent<() => React.ReactElement>> = {
    overview: OverviewTab,
    cashflow: CashFlowTab,
    spending: SpendingTab,
    accounts: AccountsTab,
    budget: BudgetTab,
    insights: InsightsTab,
};

const TAB_LABELS: Record<CockpitTab, string> = {
    overview: "Overview",
    cashflow: "Cash flow",
    spending: "Spending",
    accounts: "Accounts",
    budget: "Budget",
    insights: "Insights",
};

export default function AnalyticsCockpitPage() {
    const { space } = useCurrentSpace();
    const state = useCockpitState();
    const { mode } = useMetricMode();

    const value = useMemo<CockpitValue>(
        () => ({
            space,
            granularity: state.granularity,
            anchor: state.anchor,
            period: state.period,
            isCurrent: state.isCurrent,
            mode,
            year: getAppTzYear(state.anchor),
            lookbackDays:
                state.granularity === "year"
                    ? 365
                    : state.granularity === "month"
                      ? 90
                      : 30,
            trailingMonths: (n: number) => trailingMonthWindow(state.anchor, n),
            setTab: state.setTab,
        }),
        [
            space,
            state.granularity,
            state.anchor,
            state.period,
            state.isCurrent,
            mode,
            state.setTab,
        ]
    );

    const ActiveTab = TAB_COMPONENTS[state.tab];

    return (
        <div className="grid gap-5 sm:gap-6">
            {/* Sticky command bar — the single source of truth for time. */}
            <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:-mx-8">
                <div className="flex flex-col gap-3 px-4 pt-3 sm:px-8">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h1 className="text-lg font-semibold tracking-tight">
                                Analytics
                            </h1>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <GranularityStepper
                                granularity={state.granularity}
                                period={state.period}
                                isCurrent={state.isCurrent}
                                onGranularity={state.setGranularity}
                                onStep={state.step}
                                onToday={state.goToCurrent}
                                onCustom={state.setCustom}
                            />
                            <MetricToggle />
                        </div>
                    </div>
                    <div
                        role="tablist"
                        aria-label="Analytics sections"
                        className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                        {COCKPIT_TABS.map((t) => {
                            const active = state.tab === t;
                            return (
                                <button
                                    key={t}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => state.setTab(t)}
                                    className={cn(
                                        "relative whitespace-nowrap px-3 pb-3 pt-1 text-sm transition-colors",
                                        active
                                            ? "font-semibold text-foreground"
                                            : "font-medium text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {TAB_LABELS[t]}
                                    {active && (
                                        <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <CockpitProvider value={value}>
                <CockpitKpiBand />
                <Suspense fallback={<TabSkeleton />}>
                    <ActiveTab />
                </Suspense>
            </CockpitProvider>
        </div>
    );
}

/** Always-visible headline strip, scoped to the focused period. The
 *  balance tile is point-in-time ("as of today"); the income/spending/net
 *  tiles are period-scoped. `placeholderData` keeps the previous numbers
 *  on screen while stepping so it feels like a cursor, not a reload. */
function CockpitKpiBand() {
    const { space, period, mode } = useCockpit();
    const input = { periodStart: period.start, periodEnd: period.end };

    const qSpace = trpc.analytics.spaceSummary.useQuery(
        { spaceId: space.id, ...input },
        { enabled: !space.isPersonal, placeholderData: (prev) => prev }
    );
    const qPersonal = trpc.personal.summary.useQuery(input, {
        enabled: space.isPersonal,
        placeholderData: (prev) => prev,
    });
    const q = space.isPersonal ? qPersonal : qSpace;
    const d = q.data;

    const income = d ? (mode === "cash" ? d.periodIncome : d.operationalIncome) : 0;
    const expense = d ? (mode === "cash" ? d.periodExpense : d.operationalExpense) : 0;
    const net = income - expense;
    const savingsRate = income > 0 ? (net / income) * 100 : 0;

    const items: KpiItem[] = [
        {
            label: mode === "cash" ? "Inflow" : "Income",
            value: income,
            tone: "income",
            money: true,
        },
        {
            label: mode === "cash" ? "Outflow" : "Spending",
            value: expense,
            tone: "expense",
            money: true,
        },
        {
            label: mode === "cash" ? "Net cash" : "Net flow",
            value: net,
            tone: net < 0 ? "expense" : "income",
            money: true,
            sub: net >= 0 ? "saved this period" : "drawdown",
        },
        {
            label: mode === "cash" ? "Savings rate" : "Operational rate",
            value: savingsRate,
            valueFormat: "percent",
            tone: savingsRate < 0 ? "expense" : "neutral",
        },
        {
            label: "Balance",
            value: d?.totalBalance ?? 0,
            money: true,
            tone: "neutral",
            sub: "as of today",
        },
    ];

    return <KpiStrip items={items} isLoading={q.isLoading && !d} />;
}

function TabSkeleton() {
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-64 w-full sm:col-span-2" />
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-56 w-full" />
        </div>
    );
}
