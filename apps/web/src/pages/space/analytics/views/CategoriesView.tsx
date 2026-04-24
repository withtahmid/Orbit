import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, CornerDownLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { Donut, type DonutDatum } from "@/components/shared/charts/Donut";
import { AllocationFlowBar } from "@/components/shared/charts/AllocationFlowBar";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";
import { ROUTES } from "@/router/routes";

/**
 * Sentinel id used for the "<parent> (direct)" pseudo-slice in drilled
 * views. Anything with this prefix is not a real category and should be
 * routed to transactions for the parent id, not treated as a drilldown.
 */
const DIRECT_SLICE_PREFIX = "__direct__:";

/**
 * Sentinel id prefix for envelope-level slices at the top of the view.
 * Clicking an envelope slice focuses on that envelope and shows its
 * root categories. Envelopes aren't in the `expense_categories` tree,
 * so we synthesize them as pseudo-nodes at render time.
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
    const rows = useMemo(() => (q.data ?? []) as Row[], [q.data]);

    // Envelope metadata (name, color, icon) for the top-level grouping.
    // Personal path: use personal.envelopeUtilization which returns
    // envelopes across all member spaces already tagged.
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

    // Focus can be either an envelope (id prefixed "env:") or a real
    // category id. Envelope focus shows the root categories of that
    // envelope; category focus shows that category's children.
    const isEnvelopeFocus = !!focusId && focusId.startsWith(ENVELOPE_ID_PREFIX);
    const focusedEnvelopeId = isEnvelopeFocus
        ? focusId!.slice(ENVELOPE_ID_PREFIX.length)
        : null;
    const focusedEnvelope = focusedEnvelopeId
        ? envelopeMeta.get(focusedEnvelopeId) ?? null
        : null;
    const focus =
        focusId && !isEnvelopeFocus ? byId.get(focusId) ?? null : null;

    const ancestors = useMemo(() => {
        // Category ancestors walk up via parent_id, stopping at the
        // root category. Prepend the envelope at the top.
        const chain: Array<Row | (EnvelopeMeta & { kind: "env" })> = [];
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

    // What rows does the donut + breakdown show? Priority:
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
        // Aggregate per-envelope spend from root categories' subtree totals.
        const totals = new Map<string, number>();
        for (const r of rows) {
            if (r.parentId === null) {
                totals.set(
                    r.envelopId,
                    (totals.get(r.envelopId) ?? 0) + r.subtreeTotal
                );
            }
        }
        const list: Array<{
            envelope: EnvelopeMeta;
            total: number;
        }> = [];
        for (const [envId, total] of totals) {
            const env = envelopeMeta.get(envId);
            if (env) list.push({ envelope: env, total });
        }
        // Also surface envelopes that exist but have no spend this period,
        // behind the `> 0` filter at render time.
        for (const env of envelopeMeta.values()) {
            if (!totals.has(env.id)) {
                list.push({ envelope: env, total: 0 });
            }
        }
        return list;
    }, [rows, envelopeMeta]);

    // Donut slices. Three modes: top level (envelopes), envelope-focused
    // (root categories of the envelope), category-focused (children, with
    // a "(direct)" slice prepended for spending on the focus itself).
    const donutData: DonutDatum[] = useMemo(() => {
        if (!focus && !focusedEnvelopeId) {
            return topLevelEnvelopes
                .filter((e) => e.total > 0)
                .map((e) => ({
                    id: `${ENVELOPE_ID_PREFIX}${e.envelope.id}`,
                    name: e.envelope.name,
                    value: e.total,
                    color: e.envelope.color,
                    hint: "Envelope. Click to see its categories.",
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
                    hint:
                        c.subtreeTotal !== c.directTotal
                            ? "Includes sub-categories. Click to drill in."
                            : undefined,
                }));
        }
        const slices: DonutDatum[] = [];
        if (focus && focus.directTotal > 0) {
            slices.push({
                id: `${DIRECT_SLICE_PREFIX}${focus.id}`,
                name: `${focus.name} (direct)`,
                value: focus.directTotal,
                color: focus.color,
                hint: "Transactions tagged directly to this category",
            });
        }
        for (const c of focusChildren) {
            if (c.subtreeTotal > 0) {
                slices.push({
                    id: c.id,
                    name: c.name,
                    value: c.subtreeTotal,
                    color: c.color,
                    hint:
                        c.subtreeTotal !== c.directTotal
                            ? "Includes sub-categories. Click to drill in."
                            : undefined,
                });
            }
        }
        return slices;
    }, [focus, focusedEnvelopeId, focusChildren, envelopeRootRows, topLevelEnvelopes]);

    const focusedEnvelopeTotal = useMemo(() => {
        if (!focusedEnvelopeId || focus) return undefined;
        return (
            topLevelEnvelopes.find((e) => e.envelope.id === focusedEnvelopeId)
                ?.total ?? 0
        );
    }, [focusedEnvelopeId, focus, topLevelEnvelopes]);
    const centerValue = focus
        ? focus.subtreeTotal
        : focusedEnvelopeTotal;
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
            { replace: false } // allow browser back to pop out of drill-down
        );
    };

    const onSelect = (d: DonutDatum) => {
        // Envelope slice → focus on the envelope.
        if (d.id.startsWith(ENVELOPE_ID_PREFIX)) {
            setFocus(d.id);
            return;
        }
        // "(direct)" pseudo-slice: open transactions filtered to the focus
        // category. Server defaults includeDescendants=true, but since the
        // direct slice *is* the parent-with-no-descendants concept, this is
        // the closest approximation without extra URL params.
        if (d.id.startsWith(DIRECT_SLICE_PREFIX)) {
            const realId = d.id.slice(DIRECT_SLICE_PREFIX.length);
            navigate(
                `${ROUTES.spaceTransactions(space.id)}?category=${realId}`
            );
            return;
        }
        const node = byId.get(d.id);
        if (!node) return;
        const hasChildren = (childrenByParent.get(node.id) ?? []).length > 0;
        if (hasChildren) {
            setFocus(node.id);
        } else {
            navigate(
                `${ROUTES.spaceTransactions(space.id)}?category=${node.id}`
            );
        }
    };

    // Rows for the breakdown + "All categories" sections. When drilled,
    // narrow to the focus subtree (or focused envelope) so the whole
    // page stays coherent.
    const subtreeIds = useMemo(() => {
        if (!focus) return null;
        const set = new Set<string>([focus.id]);
        const stack = [focus.id];
        while (stack.length) {
            const id = stack.pop()!;
            for (const c of childrenByParent.get(id) ?? []) {
                set.add(c.id);
                stack.push(c.id);
            }
        }
        return set;
    }, [focus, childrenByParent]);

    const breakdownRoots: Row[] = focus
        ? focusChildren
        : focusedEnvelopeId
          ? envelopeRootRows
          : [];
    const listRows: Row[] = focus
        ? subtreeIds
            ? rows.filter((r) => subtreeIds.has(r.id))
            : rows
        : focusedEnvelopeId
          ? rows.filter((r) => r.envelopId === focusedEnvelopeId)
          : rows;

    return (
        <AnalyticsDetailLayout
            title="Spending by category"
            description="Starts at the envelope level. Click an envelope to see its categories; click a category to drill further; leaves open the matching transactions."
            actions={<PeriodSelector />}
        >
            <Breadcrumb
                ancestors={ancestors}
                onNavigate={(id) => setFocus(id)}
            />

            <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                    <CardTitle>
                        {focus
                            ? `Inside ${focus.name}`
                            : focusedEnvelope
                              ? `Inside ${focusedEnvelope.name}`
                              : "Distribution"}
                    </CardTitle>
                    {(focus || focusedEnvelope) && (
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
                        >
                            <CornerDownLeft />
                            Back
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    {q.isLoading ? (
                        <Skeleton className="h-[280px] w-full" />
                    ) : (
                        <Donut
                            data={donutData}
                            centerLabel={centerLabel}
                            centerValue={centerValue}
                            height={300}
                            onSelect={onSelect}
                            emptyLabel={
                                focus
                                    ? `No spending in ${focus.name} for this period.`
                                    : focusedEnvelope
                                      ? `No spending in ${focusedEnvelope.name} for this period.`
                                      : "No spending in this period."
                            }
                        />
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>
                        {focus
                            ? `Sub-categories of ${focus.name}`
                            : focusedEnvelope
                              ? `Categories in ${focusedEnvelope.name}`
                              : "Envelopes this period"}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {q.isLoading ? (
                        <Skeleton className="h-64 w-full" />
                    ) : !focus && !focusedEnvelopeId ? (
                        <EnvelopeFlow
                            rows={topLevelEnvelopes}
                            onSelect={(envId) =>
                                setFocus(`${ENVELOPE_ID_PREFIX}${envId}`)
                            }
                        />
                    ) : breakdownRoots.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {focus
                                ? `${focus.name} has no sub-categories.`
                                : "No categories in this envelope yet."}
                        </p>
                    ) : (
                        <AllocationFlowBar
                            rows={breakdownRoots
                                .filter((c) => c.subtreeTotal > 0)
                                .map((c) => {
                                    const children = childrenByParent.get(c.id) ?? [];
                                    const segments =
                                        children.length > 0
                                            ? [
                                                  ...(c.directTotal > 0
                                                      ? [
                                                            {
                                                                id: c.id + "-self",
                                                                name:
                                                                    c.name + " (direct)",
                                                                value: c.directTotal,
                                                                color: c.color,
                                                            },
                                                        ]
                                                      : []),
                                                  ...children
                                                      .filter((k) => k.subtreeTotal > 0)
                                                      .map((k) => ({
                                                          id: k.id,
                                                          name: k.name,
                                                          value: k.subtreeTotal,
                                                          color: k.color,
                                                      })),
                                              ]
                                            : [
                                                  {
                                                      id: c.id,
                                                      name: c.name,
                                                      value: c.subtreeTotal,
                                                      color: c.color,
                                                  },
                                              ];
                                    const hasChildren = children.length > 0;
                                    return {
                                        id: c.id,
                                        name: c.name,
                                        leading: (
                                            <EntityAvatar
                                                size="sm"
                                                color={c.color}
                                                icon={c.icon}
                                            />
                                        ),
                                        segments,
                                        rightLabel: undefined,
                                        onClick: hasChildren
                                            ? () => setFocus(c.id)
                                            : () =>
                                                  navigate(
                                                      `${ROUTES.spaceTransactions(
                                                          space.id
                                                      )}?category=${c.id}`
                                                  ),
                                    };
                                })}
                        />
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>
                        {focus
                            ? `All categories inside ${focus.name}`
                            : focusedEnvelope
                              ? `All categories in ${focusedEnvelope.name}`
                              : "All categories"}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {q.isLoading ? (
                        <Skeleton className="h-48 w-full" />
                    ) : listRows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No categories yet.
                        </p>
                    ) : (
                        <div className="grid gap-1">
                            {listRows.map((c) => (
                                <div
                                    key={c.id}
                                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent/30"
                                    style={{
                                        paddingLeft: `${(c.parentId ? 1.5 : 0.5) * 16}px`,
                                    }}
                                >
                                    <span className="flex min-w-0 items-center gap-2">
                                        <EntityAvatar
                                            size="sm"
                                            color={c.color}
                                            icon={c.icon}
                                        />
                                        <span className="truncate text-sm">{c.name}</span>
                                    </span>
                                    <span className="shrink-0 text-right">
                                        <MoneyDisplay
                                            amount={c.subtreeTotal}
                                            variant="expense"
                                        />
                                        {c.parentId === null &&
                                            c.subtreeTotal !== c.directTotal && (
                                                <span className="ml-2 text-[11px] text-muted-foreground">
                                                    ({formatInline(c.directTotal)} direct)
                                                </span>
                                            )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </AnalyticsDetailLayout>
    );
}

type BreadcrumbNode =
    | Row
    | (EnvelopeMeta & { kind: "env" });

function Breadcrumb({
    ancestors,
    onNavigate,
}: {
    ancestors: BreadcrumbNode[];
    onNavigate: (id: string | null) => void;
}) {
    return (
        <div className="flex flex-wrap items-center gap-1 text-sm">
            <button
                type="button"
                onClick={() => onNavigate(null)}
                className={
                    ancestors.length === 0
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                }
            >
                All envelopes
            </button>
            {ancestors.map((a, i) => {
                const isLast = i === ancestors.length - 1;
                const navId =
                    "kind" in a && a.kind === "env"
                        ? `${ENVELOPE_ID_PREFIX}${a.id}`
                        : a.id;
                return (
                    <span key={a.id} className="flex items-center gap-1">
                        <ChevronRight className="size-3.5 text-muted-foreground/60" />
                        <button
                            type="button"
                            onClick={() => onNavigate(navId)}
                            disabled={isLast}
                            className={
                                isLast
                                    ? "flex items-center gap-1.5 font-semibold text-foreground"
                                    : "flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                            }
                        >
                            <EntityAvatar size="sm" color={a.color} icon={a.icon} />
                            {a.name}
                        </button>
                    </span>
                );
            })}
        </div>
    );
}

function EnvelopeFlow({
    rows,
    onSelect,
}: {
    rows: Array<{ envelope: EnvelopeMeta; total: number }>;
    onSelect: (envelopeId: string) => void;
}) {
    const active = rows.filter((r) => r.total > 0);
    if (active.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No spending to analyze.
            </p>
        );
    }
    return (
        <AllocationFlowBar
            rows={active.map((r) => ({
                id: r.envelope.id,
                name: r.envelope.name,
                leading: (
                    <EntityAvatar
                        size="sm"
                        color={r.envelope.color}
                        icon={r.envelope.icon}
                    />
                ),
                segments: [
                    {
                        id: r.envelope.id,
                        name: r.envelope.name,
                        value: r.total,
                        color: r.envelope.color,
                    },
                ],
                onClick: () => onSelect(r.envelope.id),
            }))}
        />
    );
}

function formatInline(n: number): string {
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(n);
}
