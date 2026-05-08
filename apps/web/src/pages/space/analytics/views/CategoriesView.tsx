import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
    ArrowDownRight,
    ArrowUpRight,
    ChevronRight,
    CornerDownLeft,
    Folder,
    Home,
    Minus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { PeriodChip } from "@/components/shared/PeriodChip";
import {
    DrillableDonut,
    type DrillableDonutSlice,
} from "@/components/shared/charts/DrillableDonut";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { KpiStrip, type KpiItem } from "@/components/shared/KpiStrip";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";
import { ROUTES } from "@/router/routes";
import { cn } from "@/lib/utils";

/**
 * Sentinel id used for the "<parent> (direct)" pseudo-slice in drilled
 * views — represents transactions tagged directly to a parent that also
 * has children. Anything with this prefix is not a real category and
 * should be routed to transactions for the parent id.
 */
const DIRECT_SLICE_PREFIX = "__direct__:";

/**
 * Sentinel id prefix for envelope-level slices at the top of the view.
 * Envelopes aren't in the `expense_categories` tree so we synthesize them
 * as pseudo-nodes at render time.
 */
const ENVELOPE_ID_PREFIX = "env:";

type Row = {
    id: string;
    parentId: string | null;
    name: string;
    color: string;
    icon: string;
    envelopId: string;
    directTotal: number;
    subtreeTotal: number;
};

type EnvelopeMeta = {
    id: string;
    name: string;
    color: string;
    icon: string;
};

export default function CategoriesView() {
    const { space } = useCurrentSpace();
    const navigate = useNavigate();
    const { period } = usePeriod("this-month");
    const [params, setParams] = useSearchParams();
    const focusId = params.get("cat");

    // Previous period of equal length, used for MoM deltas. Floor at epoch
    // so "all-time" doesn't blow up the date range.
    const prevPeriod = useMemo(() => {
        const dur = Math.max(0, period.end.getTime() - period.start.getTime());
        const start = new Date(
            Math.max(0, period.start.getTime() - dur)
        );
        return { start, end: period.start };
    }, [period.start, period.end]);

    const qSpace = trpc.analytics.categoryBreakdown.useQuery(
        {
            spaceId: space.id,
            periodStart: period.start,
            periodEnd: period.end,
        },
        { enabled: !space.isPersonal }
    );
    const qPersonal = trpc.personal.categoryBreakdown.useQuery(
        {
            periodStart: period.start,
            periodEnd: period.end,
        },
        { enabled: space.isPersonal }
    );
    const q = space.isPersonal ? qPersonal : qSpace;

    // Previous period: only enabled once focus is set or once we have data,
    // since the deltas are a secondary signal.
    const prevSpaceQ = trpc.analytics.categoryBreakdown.useQuery(
        {
            spaceId: space.id,
            periodStart: prevPeriod.start,
            periodEnd: prevPeriod.end,
        },
        { enabled: !space.isPersonal }
    );
    const prevPersonalQ = trpc.personal.categoryBreakdown.useQuery(
        {
            periodStart: prevPeriod.start,
            periodEnd: prevPeriod.end,
        },
        { enabled: space.isPersonal }
    );
    const prevQ = space.isPersonal ? prevPersonalQ : prevSpaceQ;

    const rows = useMemo(() => (q.data ?? []) as Row[], [q.data]);
    const prevRows = useMemo(() => (prevQ.data ?? []) as Row[], [prevQ.data]);
    const prevById = useMemo(() => {
        const m = new Map<string, Row>();
        for (const r of prevRows) m.set(r.id, r);
        return m;
    }, [prevRows]);

    // Envelope metadata for grouping
    const envSpaceQ = trpc.envelop.listBySpace.useQuery(
        { spaceId: space.id },
        { enabled: !space.isPersonal }
    );
    const envPersonalQ = trpc.personal.envelopeUtilization.useQuery(
        { periodStart: period.start, periodEnd: period.end },
        { enabled: space.isPersonal }
    );
    const envelopeMeta = useMemo<Map<string, EnvelopeMeta>>(() => {
        const m = new Map<string, EnvelopeMeta>();
        if (space.isPersonal) {
            for (const e of envPersonalQ.data ?? []) {
                m.set(e.envelopId, {
                    id: e.envelopId,
                    name: e.name,
                    color: e.color,
                    icon: e.icon,
                });
            }
        } else {
            for (const e of envSpaceQ.data ?? []) {
                m.set(e.id, {
                    id: e.id,
                    name: e.name,
                    color: e.color,
                    icon: e.icon,
                });
            }
        }
        return m;
    }, [space.isPersonal, envSpaceQ.data, envPersonalQ.data]);

    const byId = useMemo(() => {
        const m = new Map<string, Row>();
        for (const r of rows) m.set(r.id, r);
        return m;
    }, [rows]);

    const childrenByParent = useMemo(() => {
        const m = new Map<string | null, Row[]>();
        for (const r of rows) {
            const arr = m.get(r.parentId) ?? [];
            arr.push(r);
            m.set(r.parentId, arr);
        }
        return m;
    }, [rows]);

    const isEnvelopeFocus = !!focusId && focusId.startsWith(ENVELOPE_ID_PREFIX);
    const focusedEnvelopeId = isEnvelopeFocus
        ? focusId!.slice(ENVELOPE_ID_PREFIX.length)
        : null;
    const focusedEnvelope = focusedEnvelopeId
        ? envelopeMeta.get(focusedEnvelopeId) ?? null
        : null;
    const focus = focusId && !isEnvelopeFocus ? byId.get(focusId) ?? null : null;

    type Crumb = Row | (EnvelopeMeta & { kind: "env" });
    const ancestors = useMemo<Crumb[]>(() => {
        const chain: Crumb[] = [];
        let envId: string | null = null;

        if (focus) {
            let cur: Row | undefined = focus;
            while (cur) {
                chain.unshift(cur);
                cur = cur.parentId ? byId.get(cur.parentId) : undefined;
            }
            envId = focus.envelopId;
        } else if (focusedEnvelopeId) {
            envId = focusedEnvelopeId;
        }

        if (envId) {
            const env = envelopeMeta.get(envId);
            if (env) {
                chain.unshift({ ...env, kind: "env" });
            }
        }
        return chain;
    }, [focus, focusedEnvelopeId, byId, envelopeMeta]);

    // The rows the donut + ranked list show, by mode:
    //   1. Category focus  → children of that category
    //   2. Envelope focus  → root categories in that envelope
    //   3. No focus        → one row per envelope (top level)
    const focusChildren = useMemo(
        () => (focus ? childrenByParent.get(focus.id) ?? [] : []),
        [focus, childrenByParent]
    );
    const envelopeRootRows = useMemo(() => {
        if (!focusedEnvelopeId) return [] as Row[];
        return rows.filter(
            (r) => r.envelopId === focusedEnvelopeId && r.parentId === null
        );
    }, [rows, focusedEnvelopeId]);
    const topLevelEnvelopes = useMemo(() => {
        const totals = new Map<string, number>();
        for (const r of rows) {
            if (r.parentId === null) {
                totals.set(
                    r.envelopId,
                    (totals.get(r.envelopId) ?? 0) + r.subtreeTotal
                );
            }
        }
        const list: Array<{ envelope: EnvelopeMeta; total: number }> = [];
        for (const [envId, total] of totals) {
            const env = envelopeMeta.get(envId);
            if (env) list.push({ envelope: env, total });
        }
        for (const env of envelopeMeta.values()) {
            if (!totals.has(env.id)) {
                list.push({ envelope: env, total: 0 });
            }
        }
        return list;
    }, [rows, envelopeMeta]);

    const prevTopLevelEnvelopes = useMemo(() => {
        const totals = new Map<string, number>();
        for (const r of prevRows) {
            if (r.parentId === null) {
                totals.set(
                    r.envelopId,
                    (totals.get(r.envelopId) ?? 0) + r.subtreeTotal
                );
            }
        }
        return totals;
    }, [prevRows]);

    // Donut slices. `drillable` flags slices that descend into another
    // level on click (envelope → categories, category → sub-categories).
    // Leaf categories and the synthesized "(direct)" pseudo-slice navigate
    // to filtered transactions instead — they're not drillable here.
    const donutData: DrillableDonutSlice[] = useMemo(() => {
        if (!focus && !focusedEnvelopeId) {
            return topLevelEnvelopes
                .filter((e) => e.total > 0)
                .map((e) => ({
                    id: `${ENVELOPE_ID_PREFIX}${e.envelope.id}`,
                    name: e.envelope.name,
                    value: e.total,
                    color: e.envelope.color,
                    drillable: true,
                }));
        }
        if (focusedEnvelopeId && !focus) {
            return envelopeRootRows
                .filter((c) => c.subtreeTotal > 0)
                .map((c) => ({
                    id: c.id,
                    name: c.name,
                    value: c.subtreeTotal,
                    color: c.color,
                    drillable:
                        (childrenByParent.get(c.id) ?? []).length > 0,
                }));
        }
        const slices: DrillableDonutSlice[] = [];
        if (focus && focus.directTotal > 0) {
            slices.push({
                id: `${DIRECT_SLICE_PREFIX}${focus.id}`,
                name: `${focus.name} (direct)`,
                value: focus.directTotal,
                color: focus.color,
                drillable: false,
            });
        }
        for (const c of focusChildren) {
            if (c.subtreeTotal > 0) {
                slices.push({
                    id: c.id,
                    name: c.name,
                    value: c.subtreeTotal,
                    color: c.color,
                    drillable:
                        (childrenByParent.get(c.id) ?? []).length > 0,
                });
            }
        }
        return slices;
    }, [
        focus,
        focusedEnvelopeId,
        focusChildren,
        envelopeRootRows,
        topLevelEnvelopes,
        childrenByParent,
    ]);

    const focusedEnvelopeTotal = useMemo(() => {
        if (!focusedEnvelopeId || focus) return undefined;
        return (
            topLevelEnvelopes.find((e) => e.envelope.id === focusedEnvelopeId)
                ?.total ?? 0
        );
    }, [focusedEnvelopeId, focus, topLevelEnvelopes]);
    const centerValue = focus ? focus.subtreeTotal : focusedEnvelopeTotal;
    const centerLabel = focus
        ? focus.name
        : focusedEnvelope
          ? focusedEnvelope.name
          : "Total spent";

    const setFocus = (id: string | null) => {
        setParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                if (id) next.set("cat", id);
                else next.delete("cat");
                return next;
            },
            { replace: false }
        );
    };

    const onSelect = (d: DrillableDonutSlice) => {
        if (d.id.startsWith(ENVELOPE_ID_PREFIX)) {
            setFocus(d.id);
            return;
        }
        if (d.id.startsWith(DIRECT_SLICE_PREFIX)) {
            const realId = d.id.slice(DIRECT_SLICE_PREFIX.length);
            navigate(`${ROUTES.spaceTransactions(space.id)}?category=${realId}`);
            return;
        }
        const node = byId.get(d.id);
        if (!node) return;
        const hasChildren = (childrenByParent.get(node.id) ?? []).length > 0;
        if (hasChildren) {
            setFocus(node.id);
        } else {
            navigate(`${ROUTES.spaceTransactions(space.id)}?category=${node.id}`);
        }
    };

    /**
     * Rows for the ranked-spend list, normalized to a uniform shape
     * regardless of which mode (envelope/category/no-focus) we're in.
     */
    type RankRow = {
        id: string;
        name: string;
        color: string;
        icon: string;
        envelopeName?: string;
        value: number;
        prevValue: number;
        drillable: boolean;
        childCount?: number;
        onClick: () => void;
    };
    const rankRows: RankRow[] = useMemo(() => {
        if (!focus && !focusedEnvelopeId) {
            return topLevelEnvelopes
                .filter((e) => e.total > 0)
                .map((e) => ({
                    id: e.envelope.id,
                    name: e.envelope.name,
                    color: e.envelope.color,
                    icon: e.envelope.icon,
                    envelopeName: e.envelope.name,
                    value: e.total,
                    prevValue: prevTopLevelEnvelopes.get(e.envelope.id) ?? 0,
                    drillable: true,
                    onClick: () => setFocus(`${ENVELOPE_ID_PREFIX}${e.envelope.id}`),
                }))
                .sort((a, b) => b.value - a.value);
        }
        const source: Row[] = focus ? focusChildren : envelopeRootRows;
        const env = focus ? envelopeMeta.get(focus.envelopId) : focusedEnvelope;
        const list: RankRow[] = source
            .filter((c) => c.subtreeTotal > 0)
            .map((c) => {
                const children = childrenByParent.get(c.id) ?? [];
                const drillable = children.length > 0;
                return {
                    id: c.id,
                    name: c.name,
                    color: c.color,
                    icon: c.icon,
                    envelopeName: env?.name,
                    value: c.subtreeTotal,
                    prevValue: prevById.get(c.id)?.subtreeTotal ?? 0,
                    drillable,
                    childCount: children.length,
                    onClick: drillable
                        ? () => setFocus(c.id)
                        : () =>
                              navigate(
                                  `${ROUTES.spaceTransactions(space.id)}?category=${c.id}`
                              ),
                };
            });
        if (focus && focus.directTotal > 0) {
            list.unshift({
                id: `${DIRECT_SLICE_PREFIX}${focus.id}`,
                name: `${focus.name} (direct)`,
                color: focus.color,
                icon: focus.icon,
                envelopeName: env?.name,
                value: focus.directTotal,
                prevValue: prevById.get(focus.id)?.directTotal ?? 0,
                drillable: false,
                onClick: () =>
                    navigate(
                        `${ROUTES.spaceTransactions(space.id)}?category=${focus.id}`
                    ),
            });
        }
        return list.sort((a, b) => b.value - a.value);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        focus,
        focusedEnvelopeId,
        topLevelEnvelopes,
        envelopeRootRows,
        focusChildren,
        prevById,
        prevTopLevelEnvelopes,
        envelopeMeta,
        focusedEnvelope,
        childrenByParent,
        space.id,
    ]);

    /**
     * KPI summary — re-derived per mode. Uses prev-period rows for MoM delta.
     */
    const kpi = useMemo(() => {
        const total = rankRows.reduce((acc, r) => acc + r.value, 0);
        const prevTotal = focus
            ? prevById.get(focus.id)?.subtreeTotal ?? 0
            : focusedEnvelopeId
              ? prevTopLevelEnvelopes.get(focusedEnvelopeId) ?? 0
              : Array.from(prevTopLevelEnvelopes.values()).reduce(
                    (s, v) => s + v,
                    0
                );
        const top = rankRows[0];
        const largestPct = total > 0 && top ? (top.value / total) * 100 : 0;
        const momDelta =
            prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
        return {
            total,
            prevTotal,
            top,
            largestPct,
            momDelta,
            count: rankRows.length,
        };
    }, [rankRows, focus, focusedEnvelopeId, prevById, prevTopLevelEnvelopes]);

    const kpiItems: KpiItem[] = [
        {
            label: focus
                ? `Total in ${focus.name}`
                : focusedEnvelope
                  ? `Total in ${focusedEnvelope.name}`
                  : "Total spent",
            value: kpi.total,
            money: true,
            tone: "expense",
            sub:
                kpi.count > 0
                    ? `Across ${kpi.count} ${
                          !focus && !focusedEnvelopeId
                              ? "envelopes"
                              : "categories"
                      }`
                    : "No spend in period",
        },
        {
            label: "Largest share",
            value: kpi.largestPct,
            valueFormat: "percent",
            sub: kpi.top ? kpi.top.name : "—",
        },
        {
            label: "MoM delta",
            value: kpi.momDelta ?? 0,
            valueFormat: "percent",
            tone:
                kpi.momDelta === null
                    ? "muted"
                    : kpi.momDelta > 0
                      ? "expense"
                      : kpi.momDelta < 0
                        ? "income"
                        : "neutral",
            sub: kpi.momDelta === null ? "no prior period data" : "vs previous period",
        },
        {
            label: "Categories",
            value: kpi.count,
            valueFormat: "integer",
            sub: focus
                ? "in this branch"
                : focusedEnvelope
                  ? "in this envelope"
                  : "envelopes shown",
        },
    ];

    const isLeaf =
        focus !== null &&
        (childrenByParent.get(focus.id) ?? []).length === 0 &&
        focus.subtreeTotal === focus.directTotal;

    return (
        <AnalyticsDetailLayout
            title="Spending by category"
            description="Click a slice or row to drill into sub-categories. The breadcrumb above the chart shows where you are."
            actions={<PeriodChip />}
        >
            {/* Breadcrumb in a thin pill row matching the design */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5">
                <Folder className="size-3.5 text-muted-foreground" />
                <BreadcrumbItem
                    onClick={() => setFocus(null)}
                    isLast={ancestors.length === 0}
                    leading={<Home className="size-3" />}
                    label="All categories"
                />
                {ancestors.map((a, i) => {
                    const isLast = i === ancestors.length - 1;
                    const navId =
                        "kind" in a && a.kind === "env"
                            ? `${ENVELOPE_ID_PREFIX}${a.id}`
                            : a.id;
                    return (
                        <span key={a.id} className="flex items-center gap-2">
                            <ChevronRight className="size-3 text-muted-foreground/50" />
                            <BreadcrumbItem
                                onClick={() => setFocus(navId)}
                                isLast={isLast}
                                leading={
                                    <span
                                        className="size-1.5 rounded-full"
                                        style={{ backgroundColor: a.color }}
                                    />
                                }
                                label={a.name}
                            />
                        </span>
                    );
                })}
                <span className="ml-auto flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground">
                        {!focus && !focusedEnvelopeId
                            ? `${kpi.count} envelopes`
                            : isLeaf
                              ? "Leaf — no sub-categories"
                              : `${rankRows.length} sub-${
                                    focus ? "categories" : "categories"
                                }`}
                    </span>
                    {ancestors.length > 0 && (
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                                const parent = ancestors[ancestors.length - 2];
                                if (!parent) {
                                    setFocus(null);
                                    return;
                                }
                                if ("kind" in parent && parent.kind === "env") {
                                    setFocus(`${ENVELOPE_ID_PREFIX}${parent.id}`);
                                } else {
                                    setFocus(parent.id);
                                }
                            }}
                            className="h-7 gap-1 px-2 text-[11px]"
                        >
                            <CornerDownLeft className="size-3" />
                            Up
                        </Button>
                    )}
                </span>
            </div>

            <KpiStrip items={kpiItems} isLoading={q.isLoading} />

            {isLeaf ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                        <EntityAvatar
                            size="lg"
                            color={focus!.color}
                            icon={focus!.icon}
                        />
                        <span className="text-base font-semibold">{focus!.name}</span>
                        <span className="max-w-md text-xs text-muted-foreground">
                            This is a leaf category. Drilling stops here — see matching
                            transactions below.
                        </span>
                        <div className="mt-1 flex flex-wrap justify-center gap-2">
                            <Button
                                size="sm"
                                onClick={() =>
                                    navigate(
                                        `${ROUTES.spaceTransactions(space.id)}?category=${
                                            focus!.id
                                        }`
                                    )
                                }
                            >
                                View transactions
                            </Button>
                            {(() => {
                                const env = envelopeMeta.get(focus!.envelopId);
                                if (!env) return null;
                                return (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                            navigate(
                                                ROUTES.spaceEnvelopeDetail(
                                                    space.id,
                                                    env.id
                                                )
                                            )
                                        }
                                    >
                                        Open envelope · {env.name}
                                    </Button>
                                );
                            })()}
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                    <Card>
                        <CardHeader>
                            <CardTitle>Distribution</CardTitle>
                            <p className="text-xs text-muted-foreground">
                                Click a slice to drill in.
                            </p>
                        </CardHeader>
                        <CardContent>
                            {q.isLoading ? (
                                <Skeleton className="h-[280px] w-full" />
                            ) : donutData.length === 0 ? (
                                <p className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                                    {focus
                                        ? `No spending in ${focus.name} for this period.`
                                        : focusedEnvelope
                                          ? `No spending in ${focusedEnvelope.name} for this period.`
                                          : "No spending in this period."}
                                </p>
                            ) : (
                                <DrillableDonut
                                    slices={donutData}
                                    centerLabel={
                                        centerLabel === "Total spent" ||
                                        !centerLabel
                                            ? "Total"
                                            : centerLabel
                                    }
                                    centerValue={
                                        centerValue !== undefined
                                            ? centerValue.toLocaleString("en-US", {
                                                  maximumFractionDigits: 0,
                                              })
                                            : undefined
                                    }
                                    onSelect={onSelect}
                                    size={240}
                                    thickness={28}
                                />
                            )}
                        </CardContent>
                    </Card>

                    <Card className="overflow-hidden p-0">
                        <div className="flex flex-col gap-0.5 px-6 pt-5 pb-3">
                            <CardTitle>Ranked spend</CardTitle>
                            <p className="text-xs text-muted-foreground">
                                Click a row to drill in · arrow indicates drillable.
                            </p>
                        </div>
                        {q.isLoading ? (
                            <div className="px-6 pb-5">
                                <Skeleton className="h-64 w-full" />
                            </div>
                        ) : rankRows.length === 0 ? (
                            <p className="px-6 pb-5 text-sm text-muted-foreground">
                                Nothing spent in this period.
                            </p>
                        ) : (
                            <div className="flex flex-col">
                                {rankRows.map((r, i) => {
                                    const max = rankRows[0]?.value ?? 1;
                                    const pct = max > 0 ? (r.value / max) * 100 : 0;
                                    const delta =
                                        r.prevValue > 0
                                            ? ((r.value - r.prevValue) / r.prevValue) *
                                              100
                                            : r.value > 0
                                              ? null
                                              : 0;
                                    return (
                                        <button
                                            key={r.id}
                                            type="button"
                                            onClick={r.onClick}
                                            className={cn(
                                                "group grid items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent/30",
                                                "grid-cols-[24px_minmax(0,1fr)_auto] sm:grid-cols-[24px_minmax(0,1fr)_minmax(80px,1fr)_104px_72px_16px]",
                                                i > 0 && "border-t border-border/60",
                                                !r.drillable && "opacity-90"
                                            )}
                                        >
                                            <span className="text-[11px] tabular-nums text-muted-foreground">
                                                #{i + 1}
                                            </span>
                                            <span className="flex min-w-0 items-center gap-2.5">
                                                <EntityAvatar
                                                    size="sm"
                                                    color={r.color}
                                                    icon={r.icon}
                                                />
                                                <span className="flex min-w-0 flex-col gap-0.5">
                                                    <span className="truncate text-[13px] font-medium">
                                                        {r.name}
                                                    </span>
                                                    <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                                                        {r.envelopeName && (
                                                            <span className="truncate">
                                                                {r.envelopeName}
                                                            </span>
                                                        )}
                                                        {r.drillable &&
                                                            r.childCount !== undefined && (
                                                                <span className="text-[color:var(--primary)]">
                                                                    · {r.childCount} sub
                                                                </span>
                                                            )}
                                                    </span>
                                                </span>
                                            </span>
                                            {/* Inline bar */}
                                            <span className="hidden items-center sm:flex">
                                                <span className="relative block h-1 w-full max-w-40 overflow-hidden rounded-full bg-muted/60">
                                                    <span
                                                        className="absolute inset-y-0 left-0 rounded-full"
                                                        style={{
                                                            width: `${pct}%`,
                                                            backgroundColor: r.color,
                                                        }}
                                                    />
                                                </span>
                                            </span>
                                            {/* Money */}
                                            <span className="hidden text-right sm:inline">
                                                <MoneyDisplay
                                                    amount={r.value}
                                                    variant="neutral"
                                                />
                                            </span>
                                            {/* Delta */}
                                            <span className="hidden justify-end text-right sm:flex">
                                                <DeltaChip pct={delta} />
                                            </span>
                                            <span className="flex items-center justify-end gap-2 text-right sm:hidden">
                                                <MoneyDisplay
                                                    amount={r.value}
                                                    variant="neutral"
                                                    className="text-[13px]"
                                                />
                                            </span>
                                            <ChevronRight
                                                className={cn(
                                                    "hidden size-4 sm:inline",
                                                    r.drillable
                                                        ? "text-muted-foreground/50 group-hover:text-foreground"
                                                        : "invisible"
                                                )}
                                            />
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </Card>
                </div>
            )}
        </AnalyticsDetailLayout>
    );
}

function BreadcrumbItem({
    label,
    leading,
    isLast,
    onClick,
}: {
    label: string;
    leading?: React.ReactNode;
    isLast: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={isLast}
            className={cn(
                "inline-flex items-center gap-1.5 text-sm",
                isLast
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground"
            )}
        >
            {leading}
            <span className="truncate">{label}</span>
        </button>
    );
}

function DeltaChip({ pct }: { pct: number | null }) {
    if (pct === null) {
        return (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <Minus className="size-3" />
                new
            </span>
        );
    }
    if (Math.abs(pct) < 0.5) {
        return (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <Minus className="size-3" />
                0%
            </span>
        );
    }
    const up = pct > 0;
    return (
        <span
            className={cn(
                "inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
                up ? "text-[color:var(--expense)]" : "text-[color:var(--income)]"
            )}
        >
            {up ? (
                <ArrowUpRight className="size-3" />
            ) : (
                <ArrowDownRight className="size-3" />
            )}
            {up ? "+" : ""}
            {pct.toFixed(0)}%
        </span>
    );
}
