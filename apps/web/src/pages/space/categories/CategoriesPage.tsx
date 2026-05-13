import { useEffect, useMemo, useState } from "react";
import {
    FolderTree,
    Plus,
    Trash2,
    ChevronRight,
    ChevronDown,
    Pencil,
    Move,
    FolderInput,
    MoreHorizontal,
    Filter as FilterIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ColorPickerButton } from "@/components/shared/ColorPicker";
import { IconPickerButton } from "@/components/shared/IconPicker";
import { CategoryTreeSelect } from "@/components/shared/CategoryTreeSelect";
import { DateRangePicker } from "@/components/shared/DateRangePicker";
import { OrbitModalShell, OrbitField } from "@/components/orbit/OrbitModalShell";
import {
    OrbitFormStyles,
    OrbitInput,
    OrbitRadioRow,
    OrbitSelect,
    OrbitTextarea,
    OrbitInfoPill,
} from "@/components/orbit/OrbitForm";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { Folder, Layers, Check } from "lucide-react";
import { usePeriod } from "@/hooks/usePeriod";
import { trpc } from "@/trpc";
import { useInvalidateAnalytics } from "@/lib/invalidate";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { useIdempotencyKey } from "@/hooks/useIdempotencyKey";
import { DEFAULT_COLOR } from "@/lib/entityStyle";
import { resolvePeriod, addMonths } from "@/lib/dates";

type Priority = "essential" | "important" | "discretionary" | "luxury";

const PRIORITIES: Record<
    Priority,
    { label: string; color: string; desc: string }
> = {
    essential: {
        label: "Essential",
        color: "var(--income)",
        desc: "Must-spend",
    },
    important: {
        label: "Important",
        color: "var(--ent-2)",
        desc: "Should-spend",
    },
    discretionary: {
        label: "Discretionary",
        color: "var(--gold)",
        desc: "Want-spend",
    },
    luxury: {
        label: "Luxury",
        color: "var(--expense)",
        desc: "Splurge",
    },
};

const PRIORITY_OPTIONS: Array<{ value: Priority; label: string }> = [
    { value: "essential", label: "Essential" },
    { value: "important", label: "Important" },
    { value: "discretionary", label: "Discretionary" },
    { value: "luxury", label: "Luxury" },
];

const PERIOD_PRESETS: Array<{ value: string; label: string }> = [
    { value: "this-month", label: "This month" },
    { value: "last-month", label: "Last month" },
    { value: "last-3-months", label: "Last 3 months" },
    { value: "this-year", label: "This year" },
    { value: "all-time", label: "All time" },
];

interface CategoryUsage {
    id: string;
    space_id: string;
    name: string;
    default_envelop_id: string;
    parent_id: string | null;
    color: string;
    icon: string;
    priority: Priority | null;
    tx_count: number;
    spent_total: number;
    last_used: Date | string | null;
}
interface CategoryNode extends CategoryUsage {
    children: CategoryNode[];
    subtree_tx_count: number;
    subtree_spent: number;
}
interface EnvelopeLite {
    id: string;
    name: string;
    color: string;
    icon: string;
    archived: boolean;
}

function buildTree(flat: CategoryUsage[]): CategoryNode[] {
    const map = new Map<string, CategoryNode>();
    flat.forEach((c) =>
        map.set(c.id, {
            ...c,
            children: [],
            subtree_tx_count: c.tx_count,
            subtree_spent: c.spent_total,
        })
    );
    const roots: CategoryNode[] = [];
    map.forEach((node) => {
        if (node.parent_id && map.has(node.parent_id)) {
            map.get(node.parent_id)!.children.push(node);
        } else {
            roots.push(node);
        }
    });
    const accumulate = (n: CategoryNode): { tx: number; spent: number } => {
        let tx = n.tx_count;
        let spent = n.spent_total;
        for (const c of n.children) {
            const r = accumulate(c);
            tx += r.tx;
            spent += r.spent;
        }
        n.subtree_tx_count = tx;
        n.subtree_spent = spent;
        return { tx, spent };
    };
    roots.forEach(accumulate);
    return roots;
}

function maxDepth(n: CategoryNode): number {
    if (n.children.length === 0) return 1;
    return 1 + Math.max(...n.children.map(maxDepth));
}

export default function CategoriesPage() {
    const { space } = useCurrentSpace();
    const { period, preset, setPreset, setCustom } = usePeriod();

    const envelopesQuery = trpc.envelop.listBySpace.useQuery({
        spaceId: space.id,
    });
    const categoriesQuery = trpc.expenseCategory.listBySpaceWithUsage.useQuery({
        spaceId: space.id,
        periodStart: period.start,
        periodEnd: period.end,
    });

    /* Last-period spend for trend deltas. For named month-aligned presets
       we shift both ends back by whole calendar months so "this month vs
       last month" actually compares Feb-as-a-calendar-month, not a
       same-millisecond-span window that straddles month boundaries. For
       custom ranges we fall back to span subtraction since there's no
       canonical "previous custom range." */
    const lastPeriod = useMemo(() => {
        if (preset === "custom" || preset === "all-time") {
            const start = new Date(period.start);
            const end = new Date(period.end);
            const span = end.getTime() - start.getTime();
            return {
                start: new Date(start.getTime() - span),
                end: new Date(start.getTime()),
            };
        }
        const monthsBack =
            preset === "last-3-months"
                ? 3
                : preset === "last-6-months"
                  ? 6
                  : preset === "last-12-months" || preset === "this-year"
                    ? 12
                    : 1;
        return {
            start: addMonths(period.start, -monthsBack),
            end: addMonths(period.end, -monthsBack),
        };
    }, [period.start, period.end, preset]);
    const prevQuery = trpc.expenseCategory.listBySpaceWithUsage.useQuery({
        spaceId: space.id,
        periodStart: lastPeriod.start,
        periodEnd: lastPeriod.end,
    });

    const categories = useMemo(
        () => (categoriesQuery.data ?? []) as CategoryUsage[],
        [categoriesQuery.data]
    );

    const tree = useMemo(() => buildTree(categories), [categories]);

    /* Build a parallel tree for the previous period and index every node
       by id. Trend math in CategoryRow looks up the matching prev node
       and uses subtree_spent or spent_total to MATCH the cell's display
       rule (depth=0 shows subtree, deeper shows leaf) — otherwise a
       parent row with $0 direct spend always reads as 0%/new. */
    const prevNodeById = useMemo(() => {
        const prevTree = buildTree(
            (prevQuery.data ?? []) as CategoryUsage[]
        );
        const m = new Map<string, CategoryNode>();
        const walk = (n: CategoryNode) => {
            m.set(n.id, n);
            n.children.forEach(walk);
        };
        prevTree.forEach(walk);
        return m;
    }, [prevQuery.data]);

    const totals = useMemo(() => {
        const byPriority: Record<Priority, number> = {
            essential: 0,
            important: 0,
            discretionary: 0,
            luxury: 0,
        };
        const resolveEffective = (
            id: string,
            map: Map<string, CategoryUsage>
        ): Priority | null => {
            const cur = map.get(id);
            if (!cur) return null;
            if (cur.priority) return cur.priority;
            if (cur.parent_id) return resolveEffective(cur.parent_id, map);
            return null;
        };
        const map = new Map<string, CategoryUsage>();
        for (const c of categories) map.set(c.id, c);
        let total = 0;
        for (const c of categories) {
            total += c.spent_total;
            const eff = resolveEffective(c.id, map);
            if (eff) byPriority[eff] += c.spent_total;
        }
        return { byPriority, total };
    }, [categories]);

    const depth =
        tree.length > 0 ? Math.max(...tree.map(maxDepth)) : 0;
    const totalCount = categories.length;

    return (
        <div className="orbit-design ca-root">
            <style>{CA_STYLES}</style>

            <header className="ca-topbar">
                <div className="ca-topbar-text">
                    <span className="eyebrow">
                        {tree.length} top-level · {totalCount} categories · up to{" "}
                        {Math.max(1, depth)} levels deep
                    </span>
                    <h1 className="display ca-title">Categories</h1>
                    <p className="ca-sub">
                        Nest as deep as you need. Priority inherits down the tree —
                        override only where it matters.
                    </p>
                </div>
                <div className="ca-topbar-actions">
                    <PeriodPicker
                        preset={preset}
                        period={period}
                        onPresetChange={setPreset}
                        onCustomChange={setCustom}
                    />
                    <PermissionGate roles={["owner"]}>
                        <CreateCategoryDialog
                            envelopes={envelopesQuery.data ?? []}
                            categories={categories}
                            trigger={
                                <button
                                    type="button"
                                    className="od-btn od-btn-primary"
                                >
                                    <Plus className="size-3.5" /> New category
                                </button>
                            }
                        />
                    </PermissionGate>
                </div>
            </header>

            <div className="ca-scroll">
                {/* Priority legend */}
                <div className="od-card ca-priorities">
                    <span className="ca-priorities-head">
                        <span className="eyebrow">Priorities</span>
                        <span className="ca-priorities-sub">
                            Set on a category, inherited by its descendants
                        </span>
                    </span>
                    <span className="ca-priorities-divider" />
                    {(Object.keys(PRIORITIES) as Priority[]).map((p) => (
                        <span key={p} className="ca-priority-legend-cell">
                            <PriorityBadge priority={p} />
                            <span className="ca-priority-desc">
                                {PRIORITIES[p].desc}
                            </span>
                        </span>
                    ))}
                    <span className="ca-priorities-inh">
                        <PriorityBadge priority="discretionary" inherited />
                        = inherited from parent
                    </span>
                </div>

                {/* Tree table */}
                <div className="od-card ca-table-card">
                    <div className="ca-th-row">
                        {["Category", "Priority", "Spent", "Tx Count", "Trend"].map(
                            (h) => (
                                <span key={h} className="ca-th">
                                    {h}
                                </span>
                            )
                        )}
                    </div>
                    {categoriesQuery.isLoading ? (
                        <div className="ca-empty">Loading…</div>
                    ) : tree.length === 0 ? (
                        <div className="ca-empty">
                            <FolderTree
                                className="size-5"
                                style={{ color: "var(--fg-4)" }}
                            />
                            <span>No categories yet.</span>
                        </div>
                    ) : (
                        tree.map((g, i) => (
                            <CategoryRow
                                key={g.id}
                                node={g}
                                depth={0}
                                inheritedPriority={null}
                                parentColor={g.color}
                                parentIcon={g.icon}
                                isLast={i === tree.length - 1}
                                envelopes={envelopesQuery.data ?? []}
                                allCategories={categories}
                                prevNodeById={prevNodeById}
                            />
                        ))
                    )}
                </div>

                {/* Spend by priority */}
                <div className="od-card ca-section">
                    <div className="ca-sect-head">
                        <div className="ca-sect-text">
                            <h2 className="display ca-sect-title">
                                Spend by priority
                            </h2>
                            <span className="ca-sect-sub">
                                Rolled up across the entire tree, this period
                            </span>
                        </div>
                    </div>
                    <PriorityBar totals={totals} />
                    <div className="ca-priority-grid">
                        {(Object.keys(PRIORITIES) as Priority[]).map((p) => {
                            const v = totals.byPriority[p];
                            const pct = totals.total > 0 ? (v / totals.total) * 100 : 0;
                            return (
                                <div key={p} className="ca-priority-cell">
                                    <PriorityBadge priority={p} />
                                    <span
                                        className="tabular ca-priority-amt"
                                        style={{ color: "var(--fg)" }}
                                    >
                                        {v.toLocaleString("en-US", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                    </span>
                                    <span className="ca-priority-pct">
                                        {pct.toFixed(0)}% of spend
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

function PriorityBar({
    totals,
}: {
    totals: { byPriority: Record<Priority, number>; total: number };
}) {
    if (totals.total === 0) {
        return <div className="ca-priority-bar empty" />;
    }
    return (
        <div className="ca-priority-bar">
            {(Object.keys(PRIORITIES) as Priority[]).map((p) => {
                const v = totals.byPriority[p];
                const pct = (v / totals.total) * 100;
                if (pct <= 0) return null;
                return (
                    <span
                        key={p}
                        style={{
                            width: `${pct}%`,
                            background: PRIORITIES[p].color,
                        }}
                    />
                );
            })}
        </div>
    );
}

function PriorityBadge({
    priority,
    inherited = false,
}: {
    priority: Priority;
    inherited?: boolean;
}) {
    const m = PRIORITIES[priority];
    return (
        <span
            className="ca-pri-badge"
            style={{
                color: m.color,
                borderColor: `color-mix(in oklab, ${m.color} ${
                    inherited ? 18 : 30
                }%, transparent)`,
                background: `color-mix(in oklab, ${m.color} ${
                    inherited ? 6 : 10
                }%, transparent)`,
                fontStyle: inherited ? "italic" : "normal",
                opacity: inherited ? 0.78 : 1,
            }}
        >
            <span
                className="ca-pri-dot"
                style={{
                    background: m.color,
                    opacity: inherited ? 0.55 : 1,
                }}
            />
            {m.label}
            {inherited && <span className="ca-pri-inh">· inh.</span>}
        </span>
    );
}

function CategoryRow({
    node,
    depth,
    inheritedPriority,
    parentColor,
    parentIcon,
    isLast,
    envelopes,
    allCategories,
    prevNodeById,
}: {
    node: CategoryNode;
    depth: number;
    inheritedPriority: Priority | null;
    parentColor: string;
    parentIcon: string;
    isLast: boolean;
    envelopes: EnvelopeLite[];
    allCategories: CategoryUsage[];
    prevNodeById: Map<string, CategoryNode>;
}) {
    const [open, setOpen] = useState(depth < 2);
    const hasKids = node.children.length > 0;
    const effective = node.priority ?? inheritedPriority;
    const ownPriority = !!node.priority;
    const c = node.color || parentColor;
    const i = node.icon || parentIcon;
    const indent = 18 + depth * 24;
    // Match the cell's display rule (line below): depth=0 shows subtree
    // total, deeper rows show leaf-only. Trend must compare the same
    // level on both sides — otherwise a $0-direct parent always reads 0%.
    const useSubtree = depth === 0;
    const cur = useSubtree ? node.subtree_spent : node.spent_total;
    const prevNode = prevNodeById.get(node.id);
    const prev = prevNode
        ? useSubtree
            ? prevNode.subtree_spent
            : prevNode.spent_total
        : 0;
    const trend =
        prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? Infinity : 0;
    const trendUp = trend > 0;

    return (
        <>
            <div
                className={`ca-row ${depth === 0 ? "is-root" : ""}`}
                style={{
                    paddingLeft: indent,
                    borderBottom:
                        isLast && !open ? "none" : "1px solid var(--line-soft)",
                    fontSize: depth === 0 ? 13.5 : 12.5,
                    background: depth === 0 ? "var(--bg-elev-1)" : "transparent",
                    color: depth === 0 ? "var(--fg)" : "var(--fg-2)",
                    fontWeight: depth === 0 ? 500 : 400,
                }}
            >
                <span className="ca-cell-name">
                    {hasKids ? (
                        <button
                            type="button"
                            onClick={() => setOpen((o) => !o)}
                            className="ca-toggle"
                            aria-label={open ? "Collapse" : "Expand"}
                        >
                            {open ? (
                                <ChevronDown className="size-3" />
                            ) : (
                                <ChevronRight className="size-3" />
                            )}
                        </button>
                    ) : (
                        <span className="ca-toggle ca-toggle-placeholder">
                            <span
                                style={{
                                    width: 4,
                                    height: 4,
                                    borderRadius: 99,
                                    background: c,
                                    opacity: 0.5,
                                }}
                            />
                        </span>
                    )}
                    {depth === 0 ? (
                        <Avatar icon={i} color={c} size={26} />
                    ) : (
                        <span
                            className="ca-tree-line"
                            style={{
                                borderLeft: "1px solid var(--line)",
                                borderBottom: "1px solid var(--line)",
                            }}
                        />
                    )}
                    <span className="ca-cell-label">{node.name}</span>
                    {hasKids && depth === 0 && (
                        <span className="ca-count-chip">
                            {node.children.length +
                                node.children.reduce(
                                    (s, k) =>
                                        s +
                                        countDescendants(k as unknown as CategoryNode),
                                    0
                                )}
                        </span>
                    )}
                    {hasKids && depth > 0 && (
                        <span className="ca-tree-count">
                            · {node.children.length}
                        </span>
                    )}
                </span>
                <span className="ca-cell-priority">
                    {effective ? (
                        <PriorityBadge
                            priority={effective}
                            inherited={!ownPriority}
                        />
                    ) : (
                        <span style={{ color: "var(--fg-4)" }}>—</span>
                    )}
                </span>
                <span className="ca-cell-amt tabular">
                    {(depth === 0 ? node.subtree_spent : node.spent_total).toLocaleString(
                        "en-US",
                        {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        }
                    )}
                </span>
                <span className="ca-cell-amt tabular" style={{ color: "var(--fg-4)" }}>
                    {(depth === 0
                        ? node.subtree_tx_count
                        : node.tx_count
                    ).toLocaleString("en-US")}
                </span>
                <span className="ca-cell-trend">
                    {Number.isFinite(trend) && trend !== 0 ? (
                        <>
                            <Sparkline color={c} />
                            <span
                                style={{
                                    fontSize: 11,
                                    color: trendUp
                                        ? "var(--expense)"
                                        : "var(--income)",
                                }}
                            >
                                {trendUp ? "+" : "−"}
                                {Math.abs(trend).toFixed(0)}%
                            </span>
                        </>
                    ) : (
                        <span style={{ color: "var(--fg-4)", fontSize: 11 }}>
                            {trend === 0 ? "0%" : "new"}
                        </span>
                    )}
                    <PermissionGate roles={["owner"]}>
                        <CategoryRowActions
                            node={node}
                            envelopes={envelopes}
                            allCategories={allCategories}
                        />
                    </PermissionGate>
                </span>
            </div>
            {open &&
                hasKids &&
                node.children.map((k, idx) => (
                    <CategoryRow
                        key={k.id}
                        node={k}
                        depth={depth + 1}
                        inheritedPriority={effective}
                        parentColor={c}
                        parentIcon={i}
                        isLast={idx === node.children.length - 1 && isLast}
                        envelopes={envelopes}
                        allCategories={allCategories}
                        prevNodeById={prevNodeById}
                    />
                ))}
        </>
    );
}

function countDescendants(n: CategoryNode): number {
    return (
        n.children.length +
        n.children.reduce((s, k) => s + countDescendants(k), 0)
    );
}

function Sparkline({ color }: { color: string }) {
    return (
        <svg width="60" height="16" viewBox="0 0 60 16" style={{ display: "block" }}>
            <path
                d="M2 10 L10 7 L18 9 L28 5 L38 8 L48 4 L58 6"
                fill="none"
                stroke={color}
                strokeWidth="1.4"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    );
}

function Avatar({
    icon,
    color,
    size = 26,
}: {
    icon: string;
    color: string;
    size?: number;
}) {
    return (
        <span
            style={{
                width: size,
                height: size,
                borderRadius: 8,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: `color-mix(in oklab, ${color} 18%, transparent)`,
                border: `1px solid color-mix(in oklab, ${color} 30%, transparent)`,
                color,
                flexShrink: 0,
            }}
        >
            <DesignIcon name={icon} size={size * 0.5} color={color} />
        </span>
    );
}

const ICON_PATHS: Record<string, string> = {
    home: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
    cart: "M3 4h2l3 12h11l2-8H7M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    car: "M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13m-14 0v5h2v-2h10v2h2v-5m-14 0h14",
    book: "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM4 17a3 3 0 0 1 3-3h11",
    heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
    star: "m12 3 2.7 5.6 6 .7-4.4 4.3 1.2 6.1L12 16.8 6.5 19.7l1.2-6.1L3.3 9.3l6-.7z",
    bolt: "M13 2 3 14h7l-1 8 10-12h-7z",
    coffee:
        "M5 8h12v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zm12 1h2a2 2 0 1 1 0 4h-2zM7 4v2M11 4v2M15 4v2",
    folder: "M3 6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
    flame: "M12 22s7-4 7-10c0-3-2-5-3-6 0 2-1 3-2 3-1-3-3-5-3-7-2 1-6 5-6 10 0 6 7 10 7 10z",
    music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zm11-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3z",
    camera: "M3 8h4l2-3h6l2 3h4v11H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    dot: "M12 12h.01",
};

function DesignIcon({
    name,
    size,
    color,
}: {
    name: string;
    size: number;
    color: string;
}) {
    const d = ICON_PATHS[name] ?? ICON_PATHS.folder;
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

function PeriodPicker({
    preset,
    period,
    onCustomChange,
}: {
    preset: string;
    period: { start: Date; end: Date };
    onPresetChange: (p: any) => void;
    onCustomChange: (start: Date, end: Date) => void;
}) {
    const [open, setOpen] = useState(false);
    const found = PERIOD_PRESETS.find((p) => p.value === preset);
    const label = found?.label ?? "Custom";
    void resolvePeriod;
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button" className="od-btn">
                    <FilterIcon className="size-3.5" /> {label}
                    <ChevronDown
                        className="size-3"
                        style={{ color: "var(--fg-4)" }}
                    />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className="orbit-design p-0 border-0 bg-transparent shadow-none"
                style={{ width: "min(640px, calc(100vw - 32px))" }}
            >
                <DateRangePicker
                    start={period.start}
                    end={period.end}
                    onChange={() => {}}
                    onApply={(s, e) => {
                        onCustomChange(s, e);
                        setOpen(false);
                    }}
                    onCancel={() => setOpen(false)}
                />
            </PopoverContent>
        </Popover>
    );
}

/* ============================================================
   Dialogs (preserved)
   ============================================================ */

function CategoryRowActions({
    node,
    envelopes,
    allCategories,
}: {
    node: CategoryNode;
    envelopes: EnvelopeLite[];
    allCategories: CategoryUsage[];
}) {
    const { space } = useCurrentSpace();
    const invalidate = useInvalidateAnalytics();
    const [editOpen, setEditOpen] = useState(false);
    const [reparentOpen, setReparentOpen] = useState(false);
    const [envelopeOpen, setEnvelopeOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const del = trpc.expenseCategory.delete.useMutation({
        onSuccess: async () => {
            toast.success("Category deleted");
            await invalidate(space.id);
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 opacity-60 hover:opacity-100"
                        aria-label="Category actions"
                    >
                        <MoreHorizontal className="size-3.5" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            setEditOpen(true);
                        }}
                    >
                        <Pencil />
                        Edit details
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            setReparentOpen(true);
                        }}
                    >
                        <FolderInput />
                        Change parent
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            setEnvelopeOpen(true);
                        }}
                    >
                        <Move />
                        Move to envelope
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        variant="destructive"
                        onSelect={(e) => {
                            e.preventDefault();
                            setDeleteOpen(true);
                        }}
                    >
                        <Trash2 />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <EditCategoryDialog
                category={node}
                open={editOpen}
                onOpenChange={setEditOpen}
            />
            <ChangeParentDialog
                category={node}
                allCategories={allCategories}
                open={reparentOpen}
                onOpenChange={setReparentOpen}
            />
            <MoveEnvelopDialog
                category={node}
                envelopes={envelopes}
                hasChildren={node.children.length > 0}
                open={envelopeOpen}
                onOpenChange={setEnvelopeOpen}
            />
            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={`Delete "${node.name}"?`}
                description={
                    node.children.length > 0
                        ? "This category has sub-categories. They must be deleted or reparented first."
                        : "Transactions using this category will keep it referenced."
                }
                confirmLabel="Delete"
                destructive
                onConfirm={() => del.mutate({ categoryId: node.id })}
            />
        </>
    );
}

function CreateCategoryDialog({
    envelopes,
    categories,
    trigger,
    defaultEnvelopeId,
}: {
    envelopes: EnvelopeLite[];
    categories: CategoryUsage[];
    trigger?: React.ReactNode;
    defaultEnvelopeId?: string;
}) {
    const { space } = useCurrentSpace();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [envelopId, setEnvelopId] = useState(defaultEnvelopeId ?? "");
    const [parentId, setParentId] = useState("");
    const [color, setColor] = useState<string>(DEFAULT_COLOR);
    const [icon, setIcon] = useState("folder");
    const [priority, setPriority] = useState<Priority | "">("");
    const [notes, setNotes] = useState("");
    const invalidate = useInvalidateAnalytics();
    const idem = useIdempotencyKey();
    const create = trpc.expenseCategory.create.useMutation({
        onSuccess: async () => {
            toast.success("Category created");
            idem.rotate();
            await invalidate(space.id);
            setName("");
            setEnvelopId(defaultEnvelopeId ?? "");
            setParentId("");
            setColor(DEFAULT_COLOR);
            setIcon("folder");
            setPriority("");
            setNotes("");
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });

    const parentCategory = parentId ? categories.find((c) => c.id === parentId) : null;
    // Server rejects archived envelopes; filter them out of the picker
    // so the user can't pick one to begin with.
    const activeEnvelopes = useMemo(
        () => envelopes.filter((e) => !e.archived),
        [envelopes]
    );
    const parentEnvelope = parentCategory
        ? activeEnvelopes.find((e) => e.id === parentCategory.default_envelop_id)
        : null;
    // Pre-fill the envelope when a parent is selected (acting as a sensible
    // default), but keep the field editable — the user can override. If
    // the parent's default points at an archived envelope, leave the field
    // empty so the user explicitly picks an active one.
    useEffect(() => {
        if (!parentCategory) return;
        if (parentEnvelope) setEnvelopId(parentEnvelope.id);
        else setEnvelopId("");
    }, [parentCategory, parentEnvelope]);
    const envelopeInheritedFromParent =
        parentEnvelope != null && envelopId === parentEnvelope.id;

    const submit = () => {
        if (create.isPending) return;
        if (!name.trim()) return;
        if (!envelopId) {
            toast.error("Pick an envelope");
            return;
        }
        if (activeEnvelopes.length === 0) {
            toast.error("Create an envelope first");
            return;
        }
        create.mutate({
            spaceId: space.id,
            name: name.trim(),
            envelopId,
            parentId: parentId || undefined,
            color,
            icon,
            priority: priority === "" ? undefined : priority,
            idempotencyKey: idem.key,
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button variant="gradient">
                        <Plus />
                        New category
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="orbit-shell-host">
                <DialogTitle className="sr-only">Create category</DialogTitle>
                <OrbitModalShell
                    width={620}
                    eyebrow="Categories"
                    title="New category"
                    subtitle="Hierarchical labels for transactions. Priority inherits from parent unless overridden."
                    leadIcon={<Folder className="size-4" />}
                    leadColor={color}
                    onClose={() => setOpen(false)}
                    footer={
                        <>
                            <button
                                type="button"
                                className="orbit-btn"
                                onClick={() => setOpen(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="orbit-btn orbit-btn-primary"
                                disabled={
                                    !name.trim() || !envelopId || create.isPending
                                }
                                onClick={submit}
                            >
                                <Plus className="size-3.5" />
                                {create.isPending ? "Creating…" : "Create category"}
                            </button>
                        </>
                    }
                >
                    <OrbitFormStyles />
                    <style>{CAT_MODAL_STYLES}</style>
                    <div className="cat-mod-grid">
                        {/* Form column */}
                        <div className="cat-mod-form">
                            {/* Live preview */}
                            <div className="cat-mod-preview">
                                <EntityAvatar color={color} icon={icon} size="lg" />
                                <div className="cat-mod-preview-text">
                                    {parentCategory && (
                                        <span className="cat-mod-breadcrumb">
                                            {parentCategory.name}{" "}
                                            <ChevronRight className="size-2.5" />
                                        </span>
                                    )}
                                    <span className="cat-mod-name">
                                        {name.trim() || "New category"}
                                    </span>
                                    {priority !== "" && (
                                        <span
                                            className="cat-mod-prio-chip"
                                            style={{
                                                color: PRIORITIES[priority as Priority].color,
                                                borderColor: `color-mix(in oklab, ${PRIORITIES[priority as Priority].color} 30%, transparent)`,
                                                background: `color-mix(in oklab, ${PRIORITIES[priority as Priority].color} 10%, transparent)`,
                                            }}
                                        >
                                            <span
                                                style={{
                                                    width: 5,
                                                    height: 5,
                                                    borderRadius: 99,
                                                    background:
                                                        PRIORITIES[priority as Priority].color,
                                                }}
                                            />
                                            {PRIORITIES[priority as Priority].label}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <OrbitField label="Name" required>
                                <OrbitInput
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Groceries, Restaurants…"
                                    required
                                    maxLength={255}
                                    autoFocus
                                />
                            </OrbitField>

                            <OrbitField
                                label="Parent"
                                hint="Optional · controls inheritance"
                            >
                                <CategoryTreeSelect
                                    categories={categories as never}
                                    value={parentId || null}
                                    onChange={(v) => setParentId(v ?? "")}
                                    placeholder="(none — top level)"
                                    allowAll={false}
                                />
                            </OrbitField>

                            <OrbitField
                                label="Envelope"
                                hint={
                                    parentCategory
                                        ? parentEnvelope
                                            ? envelopeInheritedFromParent
                                                ? `Default from ${parentCategory.name} — change to override`
                                                : "Overriding parent's default"
                                            : `Parent's envelope is archived — pick another`
                                        : "Required"
                                }
                                required
                            >
                                <OrbitSelect
                                    value={envelopId}
                                    onValueChange={setEnvelopId}
                                    items={activeEnvelopes.map((e) => ({
                                        value: e.id,
                                        label: e.name,
                                        leadIcon: <Layers className="size-3.5" />,
                                        leadColor: e.color || "var(--ent-2)",
                                    }))}
                                    placeholder="Choose envelope"
                                    leadIcon={<Layers className="size-3.5" />}
                                    leadColor="var(--ent-2)"
                                />
                            </OrbitField>

                            <OrbitField
                                label="Priority"
                                hint={
                                    parentCategory && parentCategory.priority
                                        ? `Inherited: ${PRIORITIES[parentCategory.priority as Priority]?.label ?? parentCategory.priority}`
                                        : "Optional"
                                }
                            >
                                <OrbitRadioRow
                                    name="cat-priority"
                                    value={priority || "__unset"}
                                    onChange={(v) =>
                                        setPriority(
                                            v === "__unset" ? "" : (v as Priority)
                                        )
                                    }
                                    options={[
                                        ...PRIORITY_OPTIONS.map((p) => ({
                                            value: p.value,
                                            label: p.label,
                                            hint:
                                                p.value === "essential"
                                                    ? "Must"
                                                    : p.value === "important"
                                                      ? "Should"
                                                      : p.value === "discretionary"
                                                        ? "Want"
                                                        : "Splurge",
                                        })),
                                    ]}
                                    accent="var(--brand)"
                                />
                            </OrbitField>

                            {parentCategory && priority !== "" && (
                                <OrbitInfoPill tone="gold">
                                    Overriding parent's priority. Changes affect rolled-up
                                    "Spend by priority" totals.
                                </OrbitInfoPill>
                            )}

                            <OrbitField label="Notes" hint="Optional">
                                <OrbitTextarea
                                    rows={2}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="What counts here? e.g. anything over 6 a cup…"
                                />
                            </OrbitField>

                            <OrbitField label="Style">
                                <div className="cat-mod-style-row">
                                    <ColorPickerButton
                                        value={color}
                                        onChange={setColor}
                                    />
                                    <IconPickerButton
                                        value={icon}
                                        onChange={setIcon}
                                        color={color}
                                    />
                                </div>
                            </OrbitField>
                        </div>
                    </div>
                </OrbitModalShell>
            </DialogContent>
        </Dialog>
    );
}

const CAT_MODAL_STYLES = `
.cat-mod-grid {
    display: flex;
    flex-direction: column;
    gap: 14px;
}
.cat-mod-form { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.cat-mod-style-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.cat-mod-preview {
    padding: 16px 18px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line-soft);
    border-radius: 14px;
    display: flex;
    align-items: center;
    gap: 14px;
}
.cat-mod-preview-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
}
.cat-mod-breadcrumb {
    font-size: 11px;
    color: var(--fg-4);
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
.cat-mod-name {
    font-size: 16px;
    color: var(--fg);
    font-weight: 500;
}
.cat-mod-prio-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 9px;
    border-radius: 99px;
    border: 1px solid;
    font-size: 11px;
    font-weight: 500;
    margin-top: 4px;
    width: fit-content;
}

.cat-mod-locked {
    height: 38px;
    padding: 0 12px;
    border-radius: 10px;
    background: var(--bg-elev-1);
    border: 1px solid var(--line);
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--fg-3);
    font-size: 12.5px;
    opacity: 0.85;
}
.cat-mod-env-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 9px;
    border-radius: 99px;
    border: 1px solid;
    font-size: 11px;
    font-weight: 500;
}
.cat-mod-locked-hint { font-size: 11px; color: var(--fg-4); }
.cat-mod-locked-hint em { font-style: normal; color: var(--fg-3); }
`;

function EditCategoryDialog({
    category,
    open,
    onOpenChange,
}: {
    category: CategoryUsage;
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const { space } = useCurrentSpace();
    const [name, setName] = useState(category.name);
    const [color, setColor] = useState(category.color);
    const [icon, setIcon] = useState(category.icon);
    const [priority, setPriority] = useState<Priority | "">(
        category.priority ?? ""
    );
    const invalidate = useInvalidateAnalytics();
    const update = trpc.expenseCategory.update.useMutation({
        onSuccess: async () => {
            toast.success("Category updated");
            await invalidate(space.id);
            onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
    });
    const submit = () => {
        update.mutate({
            categoryId: category.id,
            name: name.trim(),
            color,
            icon,
            priority: priority === "" ? null : priority,
        });
    };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="orbit-shell-host">
                <DialogTitle className="sr-only">Edit category</DialogTitle>
                <OrbitModalShell
                    width={560}
                    eyebrow="Categories"
                    title="Edit category"
                    subtitle="Rename, restyle, or override the inherited priority."
                    leadIcon={<Folder className="size-4" />}
                    leadColor={color}
                    onClose={() => onOpenChange(false)}
                    footer={
                        <>
                            <button
                                type="button"
                                className="orbit-btn"
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="orbit-btn orbit-btn-primary"
                                disabled={!name.trim() || update.isPending}
                                onClick={submit}
                            >
                                <Check className="size-3.5" />
                                {update.isPending ? "Saving…" : "Save"}
                            </button>
                        </>
                    }
                >
                    <OrbitFormStyles />
                    <style>{CAT_MODAL_STYLES}</style>
                    <div className="cat-mod-grid">
                        <div className="cat-mod-form">
                            <div className="cat-mod-preview">
                                <EntityAvatar color={color} icon={icon} size="lg" />
                                <div className="cat-mod-preview-text">
                                    <span className="cat-mod-name">
                                        {name.trim() || category.name}
                                    </span>
                                    {priority !== "" && (
                                        <span
                                            className="cat-mod-prio-chip"
                                            style={{
                                                color: PRIORITIES[priority as Priority].color,
                                                borderColor: `color-mix(in oklab, ${PRIORITIES[priority as Priority].color} 30%, transparent)`,
                                                background: `color-mix(in oklab, ${PRIORITIES[priority as Priority].color} 10%, transparent)`,
                                            }}
                                        >
                                            <span
                                                style={{
                                                    width: 5,
                                                    height: 5,
                                                    borderRadius: 99,
                                                    background:
                                                        PRIORITIES[priority as Priority].color,
                                                }}
                                            />
                                            {PRIORITIES[priority as Priority].label}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <OrbitField label="Name" required>
                                <OrbitInput
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    maxLength={255}
                                    required
                                />
                            </OrbitField>
                            <OrbitField label="Priority" hint="Optional">
                                <OrbitRadioRow
                                    name="cat-edit-priority"
                                    value={priority || "__unset"}
                                    onChange={(v) =>
                                        setPriority(
                                            v === "__unset" ? "" : (v as Priority)
                                        )
                                    }
                                    options={PRIORITY_OPTIONS.map((p) => ({
                                        value: p.value,
                                        label: p.label,
                                        hint:
                                            p.value === "essential"
                                                ? "Must"
                                                : p.value === "important"
                                                  ? "Should"
                                                  : p.value === "discretionary"
                                                    ? "Want"
                                                    : "Splurge",
                                    }))}
                                />
                            </OrbitField>

                            <OrbitField label="Style">
                                <div className="cat-mod-style-row">
                                    <ColorPickerButton
                                        value={color}
                                        onChange={setColor}
                                    />
                                    <IconPickerButton
                                        value={icon}
                                        onChange={setIcon}
                                        color={color}
                                    />
                                </div>
                            </OrbitField>
                        </div>
                    </div>
                </OrbitModalShell>
            </DialogContent>
        </Dialog>
    );
}

function ChangeParentDialog({
    category,
    allCategories,
    open,
    onOpenChange,
}: {
    category: CategoryUsage;
    allCategories: CategoryUsage[];
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const { space } = useCurrentSpace();
    const [parentId, setParentId] = useState<string>(category.parent_id ?? "none");
    const invalidate = useInvalidateAnalytics();
    const mutate = trpc.expenseCategory.changeParent.useMutation({
        onSuccess: async () => {
            toast.success("Parent updated");
            await invalidate(space.id);
            onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
    });

    const invalidIds = useMemo(() => {
        const children = new Map<string, string[]>();
        for (const c of allCategories) {
            if (c.parent_id) {
                const arr = children.get(c.parent_id) ?? [];
                arr.push(c.id);
                children.set(c.parent_id, arr);
            }
        }
        const forbidden = new Set<string>([category.id]);
        const stack = [category.id];
        while (stack.length) {
            const id = stack.pop()!;
            for (const c of children.get(id) ?? []) {
                if (!forbidden.has(c)) {
                    forbidden.add(c);
                    stack.push(c);
                }
            }
        }
        return forbidden;
    }, [allCategories, category.id]);

    const candidates = allCategories.filter((c) => !invalidIds.has(c.id));
    const candidate = candidates.find((c) => c.id === parentId);
    const envelopeMismatch =
        candidate != null &&
        candidate.default_envelop_id !== category.default_envelop_id;
    const unchanged = (category.parent_id ?? "none") === parentId;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Move "{category.name}" under a different parent</DialogTitle>
                    <DialogDescription>
                        Pick a new parent category, or "(top level)" to un-nest it. You
                        can't pick the category itself or any of its descendants.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-2">
                    <Label>Parent</Label>
                    <CategoryTreeSelect
                        categories={candidates as never}
                        value={parentId === "none" ? null : parentId}
                        onChange={(v) => setParentId(v ?? "none")}
                        placeholder="(top level — no parent)"
                        allowAll={false}
                    />
                    {envelopeMismatch && (
                        <p className="text-xs text-[color:var(--warning)]">
                            Heads up: the new parent belongs to a different envelope.
                        </p>
                    )}
                </div>
                <DialogFooter className="gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="gradient"
                        disabled={mutate.isPending || unchanged}
                        onClick={() =>
                            mutate.mutate({
                                categoryId: category.id,
                                parentId: parentId === "none" ? null : parentId,
                            })
                        }
                    >
                        {mutate.isPending ? "Saving…" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function MoveEnvelopDialog({
    category,
    envelopes,
    open,
    onOpenChange,
}: {
    category: CategoryUsage;
    envelopes: EnvelopeLite[];
    hasChildren: boolean;
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const { space } = useCurrentSpace();
    const [envelopId, setEnvelopId] = useState(category.default_envelop_id);
    const invalidate = useInvalidateAnalytics();
    const mutate = trpc.expenseCategory.update.useMutation({
        onSuccess: async () => {
            toast.success("Default envelope updated");
            await invalidate(space.id);
            onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        Change default envelope for "{category.name}"
                    </DialogTitle>
                    <DialogDescription>
                        New transactions on this category will default to the
                        chosen envelope. Past transactions keep their existing
                        envelope assignment.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-2">
                    <Label>Default envelope</Label>
                    <Select value={envelopId} onValueChange={setEnvelopId}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {envelopes.map((e) => (
                                <SelectItem key={e.id} value={e.id}>
                                    {e.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <DialogFooter className="gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="gradient"
                        disabled={
                            mutate.isPending ||
                            envelopId === category.default_envelop_id
                        }
                        onClick={() =>
                            mutate.mutate({
                                categoryId: category.id,
                                defaultEnvelopId: envelopId,
                            })
                        }
                    >
                        {mutate.isPending ? "Saving…" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const CA_STYLES = `
.ca-root {
    margin: -1.5rem -1rem;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
}
@media (min-width: 768px) {
    .ca-root { margin: -2rem; }
}

.ca-topbar {
    padding: 26px 32px 18px;
    border-bottom: 1px solid var(--line-soft);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    background: var(--bg);
    flex-wrap: wrap;
}
.ca-topbar-text { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ca-title {
    font-size: 26px;
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--fg);
    margin: 0;
}
.ca-sub { font-size: 13px; color: var(--fg-3); margin: 0; }
.ca-topbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
@media (max-width: 720px) {
    .ca-topbar { padding: 18px 18px 14px; }
}

.ca-scroll {
    flex: 1;
    padding: 22px 32px 36px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}
@media (max-width: 720px) {
    .ca-scroll { padding: 16px 18px 28px; }
}

/* Priority legend */
.orbit-design .od-card.ca-priorities {
    padding: 14px 18px;
    display: flex;
    align-items: center;
    gap: 22px;
    flex-wrap: wrap;
}
.ca-priorities-head {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
}
.ca-priorities-sub {
    font-size: 11.5px;
    color: var(--fg-3);
    margin-top: 4px;
}
.ca-priorities-divider {
    width: 1px;
    height: 28px;
    background: var(--line);
}
.ca-priority-legend-cell {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}
.ca-priority-desc {
    font-size: 11px;
    color: var(--fg-4);
}
.ca-priorities-inh {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 11.5px;
    color: var(--fg-3);
}

.ca-pri-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 18px;
    padding: 0 7px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 500;
    border: 1px solid;
}
.ca-pri-dot {
    width: 6px;
    height: 6px;
    border-radius: 99px;
    flex-shrink: 0;
}
.ca-pri-inh {
    color: var(--fg-4);
    font-style: normal;
}

/* Tree table */
.orbit-design .od-card.ca-table-card {
    padding: 0;
    overflow: hidden;
}
.ca-th-row {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) 130px 1fr 1fr 160px;
    gap: 12px;
    padding: 13px 18px;
    border-bottom: 1px solid var(--line);
    background: var(--bg-elev-2);
}
.ca-th {
    font-size: 10.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--fg-4);
    font-weight: 500;
}
.ca-row {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) 130px 1fr 1fr 160px;
    gap: 12px;
    padding: 11px 18px;
    align-items: center;
}
.ca-row.is-root {
    /* lighter elevated background already set inline */
}
.ca-cell-name {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.ca-cell-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ca-toggle {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: transparent;
    border: 0;
    color: var(--fg-3);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
}
.ca-toggle:hover { background: var(--bg-elev-2); color: var(--fg); }
.ca-toggle-placeholder { cursor: default; }
.ca-toggle-placeholder:hover { background: transparent; }
.ca-tree-line {
    width: 14px;
    height: 14px;
    border-bottom-left-radius: 4px;
    margin-right: 2px;
    margin-bottom: 2px;
}
.ca-count-chip {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 7px;
    border-radius: 999px;
    font-size: 10px;
    color: var(--fg-3);
    border: 1px solid var(--line);
    background: var(--bg-elev-2);
}
.ca-tree-count {
    font-size: 10px;
    color: var(--fg-4);
}
.ca-cell-priority { display: inline-flex; align-items: center; }
.ca-cell-amt {
    text-align: left;
    font-variant-numeric: tabular-nums;
}
.ca-cell-trend {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    justify-content: flex-end;
}

.ca-empty {
    padding: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--fg-3);
    font-size: 13px;
}

/* Sections */
.ca-section { padding: 22px; }
.ca-sect-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
    flex-wrap: wrap;
}
.ca-sect-text { display: flex; flex-direction: column; gap: 2px; }
.ca-sect-title {
    font-size: 16px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--fg);
    margin: 0;
}
.ca-sect-sub { font-size: 12px; color: var(--fg-3); }

.ca-priority-bar {
    height: 10px;
    border-radius: 99px;
    overflow: hidden;
    display: flex;
    background: var(--bg-elev-3);
    margin-bottom: 14px;
}
.ca-priority-bar.empty {
    height: 10px;
}

.ca-priority-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
}
@media (max-width: 720px) {
    .ca-priority-grid { grid-template-columns: 1fr 1fr; }
}
.ca-priority-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    background: var(--bg-elev-2);
    border-radius: 8px;
    border: 1px solid var(--line-soft);
}
.ca-priority-amt {
    font-size: 20px;
    font-weight: 500;
    letter-spacing: -0.04em;
}
.ca-priority-pct {
    font-size: 11px;
    color: var(--fg-4);
}

.ca-popover-item {
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    border-radius: 6px;
    background: transparent;
    border: 0;
    font-size: 13px;
    color: var(--fg-2);
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    gap: 8px;
}
.ca-popover-item:hover { background: var(--bg-elev-2); color: var(--fg); }

/* Phone (<720px) — collapse the 5-col tree table to name + amount only,
   since the priority + trend columns crush below readability. */
@media (max-width: 720px) {
    .ca-th-row,
    .ca-row {
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        padding: 11px 12px;
    }
    .ca-th-row > :nth-child(2),
    .ca-th-row > :nth-child(4),
    .ca-th-row > :nth-child(5),
    .ca-row > :nth-child(2),
    .ca-row > :nth-child(4),
    .ca-row > :nth-child(5) {
        display: none;
    }
}

/* Phone (<640px) — section padding tightening. */
@media (max-width: 640px) {
    .ca-topbar { padding: 14px 14px 10px; }
    .ca-title { font-size: 22px; }
    .ca-scroll { padding: 12px 14px 22px; gap: 12px; }
    .ca-section { padding: 16px; }
    .ca-priority-amt { font-size: 18px; }
    .ca-priority-cell { padding: 8px 10px; }
    .orbit-design .od-card.ca-priorities {
        padding: 12px 14px;
        gap: 12px;
    }
    .ca-priorities-inh { margin-left: 0; }
    .ca-priorities-divider { display: none; }
    .ca-th-row { padding: 10px 12px; }
}
@media (max-width: 380px) {
    .ca-priority-grid { grid-template-columns: 1fr; }
}
`;
