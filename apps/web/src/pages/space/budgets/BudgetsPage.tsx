import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
    Mail,
    ChevronLeft,
    ChevronRight,
    ChevronRight as ChevronRightIcon,
    Folder as FolderIcon,
    Grid3x3,
    List as ListIcon,
    MoreHorizontal,
    Pencil,
    Plus,
    Search,
    Trash2,
    Filter as FilterIcon,
    ChevronDown,
    Check,
    ArrowRightLeft,
    Coins,
    Archive,
    ArchiveRestore,
    AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ColorPickerButton } from "@/components/shared/ColorPicker";
import { IconPickerButton } from "@/components/shared/IconPicker";
import { OrbitModalShell, OrbitField } from "@/components/orbit/OrbitModalShell";
import {
    OrbitFormStyles,
    OrbitInput,
    OrbitRadioRow,
    OrbitSelect,
    OrbitTextarea,
    OrbitFieldRow,
} from "@/components/orbit/OrbitForm";
import { getIcon } from "@/lib/entityIcons";
import { EnvelopeAllocateDialog } from "@/features/allocations/EnvelopeAllocateDialog";
import { EnvelopeMoveDialog } from "@/features/allocations/EnvelopeMoveDialog";
import { EnvelopeTopUpDialog } from "@/features/allocations/EnvelopeTopUpDialog";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { useIdempotencyKey } from "@/hooks/useIdempotencyKey";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ROUTES } from "@/router/routes";
import { DEFAULT_COLOR } from "@/lib/entityStyle";
import { addMonths, startOfMonth, endOfMonth, makeAppTzDate } from "@/lib/dates";
import type { RouterOutput } from "@/trpc";

type Cadence = "none" | "monthly";
type EnvelopeRow = RouterOutput["analytics"]["envelopeUtilization"][number];
type ViewMode = "grouped" | "list" | "grid";
type SortMode =
    | "cadence"
    | "urgency"
    | "remaining"
    | "spent"
    | "name"
    | "deadline"
    | "progress";

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
    { value: "cadence", label: "Cadence" },
    { value: "urgency", label: "Urgency" },
    { value: "spent", label: "Spent" },
    { value: "remaining", label: "Remaining" },
    { value: "deadline", label: "Deadline" },
    { value: "progress", label: "Progress" },
    { value: "name", label: "Name" },
];

function pctOf(consumed: number, allocated: number): number {
    if (allocated > 0) return (consumed / allocated) * 100;
    if (consumed > 0) return Infinity;
    return 0;
}

function sortEnvelopes(list: EnvelopeRow[], mode: SortMode): EnvelopeRow[] {
    const arr = [...list];
    if (mode === "name") arr.sort((a, b) => a.name.localeCompare(b.name));
    else if (mode === "spent") arr.sort((a, b) => b.consumed - a.consumed);
    else if (mode === "remaining") arr.sort((a, b) => b.remaining - a.remaining);
    else if (mode === "urgency")
        arr.sort(
            (a, b) =>
                pctOf(b.consumed, b.allocated + b.carryIn) -
                pctOf(a.consumed, a.allocated + a.carryIn)
        );
    else if (mode === "deadline")
        // Earliest target_date first; rows without a deadline drop to
        // the end so goal envelopes with an upcoming target lead.
        arr.sort((a, b) => {
            const aDate = a.targetDate ? new Date(a.targetDate).getTime() : Infinity;
            const bDate = b.targetDate ? new Date(b.targetDate).getTime() : Infinity;
            return aDate - bDate;
        });
    else if (mode === "progress")
        // Highest pctComplete (== pctSaved) first; rows without a target
        // are treated as 0 so plain envelopes sink below goals.
        arr.sort(
            (a, b) => (b.pctComplete ?? 0) - (a.pctComplete ?? 0)
        );
    else
        // Default "cadence" sort: monthly group first, then rolling.
        // Within each group, preserve the server's natural order
        // (created_at ASC from analytics.envelopeUtilization). Array.sort
        // is spec-stable (ES2019+), so returning 0 keeps the input order
        // — editing an envelope's name no longer relocates its row.
        arr.sort((a, b) => {
            if (a.cadence === b.cadence) return 0;
            return a.cadence === "monthly" ? -1 : 1;
        });
    return arr;
}

/**
 * Three-way grouping that surfaces the merged budget/goal model:
 *   - monthly: cadence='monthly' envelopes
 *   - goals:   cadence='none' envelopes that carry a target_amount
 *   - rolling: cadence='none' envelopes without a target
 *
 * The page renders the groups in this order so the user sees their
 * recurring budgets first, the long-horizon goals next, and any
 * uncategorized rolling cash at the bottom.
 */
type Group = "monthly" | "goals" | "rolling";

function groupEnvelopes(list: EnvelopeRow[]): Record<Group, EnvelopeRow[]> {
    const out: Record<Group, EnvelopeRow[]> = { monthly: [], goals: [], rolling: [] };
    for (const e of list) {
        if (e.cadence === "monthly") out.monthly.push(e);
        else if (e.targetAmount != null) out.goals.push(e);
        else out.rolling.push(e);
    }
    return out;
}


function buildAttention(envelopes: EnvelopeRow[]) {
    const items: Array<{
        envelopId: string;
        name: string;
        color: string;
        icon: string;
        text: string;
    }> = [];
    for (const e of envelopes) {
        const total = e.allocated + e.carryIn;
        const over = e.consumed - total;
        if (over > 0) {
            items.push({
                envelopId: e.envelopId,
                name: e.name,
                color: e.color,
                icon: e.icon,
                text: `over by ${over.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
            });
        }
    }
    return items;
}

export default function BudgetsPage() {
    const { space } = useCurrentSpace();
    const [monthOffset, setMonthOffset] = useState(0);
    const [query, setQuery] = useState("");
    const [view, setView] = useState<ViewMode>("grid");
    const [sort, setSort] = useState<SortMode>("cadence");
    const debouncedQuery = useDebouncedValue(query, 200);

    const now = useMemo(() => new Date(), []);
    const viewingDate = useMemo(() => addMonths(now, monthOffset), [now, monthOffset]);
    const periodStart = useMemo(() => startOfMonth(viewingDate), [viewingDate]);
    const periodEnd = useMemo(() => endOfMonth(viewingDate), [viewingDate]);

    const utilizationQuery = trpc.analytics.envelopeUtilization.useQuery({
        spaceId: space.id,
        periodStart,
        periodEnd,
    });

    const priorityQuery = trpc.analytics.priorityBreakdown.useQuery({
        spaceId: space.id,
        periodStart,
        periodEnd,
    });

    const summaryQuery = trpc.analytics.spaceSummary.useQuery({
        spaceId: space.id,
        periodStart,
        periodEnd,
    });

    const allEnvelopes = useMemo(
        () => utilizationQuery.data ?? [],
        [utilizationQuery.data]
    );

    // Active envelopes drive the main list, hero stats, and "needs attention".
    // Archived envelopes are revealed via the toggle below; they have no
    // current activity (server blocks new transactions/allocations) so
    // including them in totals would just be misleading zeros.
    const envelopes = useMemo(
        () => allEnvelopes.filter((e) => !e.archived),
        [allEnvelopes]
    );
    const archivedEnvelopes = useMemo(
        () => allEnvelopes.filter((e) => e.archived),
        [allEnvelopes]
    );
    const [showArchived, setShowArchived] = useState(false);

    const filtered = useMemo(() => {
        if (!debouncedQuery.trim()) return envelopes;
        const q = debouncedQuery.trim().toLowerCase();
        return envelopes.filter(
            (e) =>
                e.name.toLowerCase().includes(q) ||
                (e.description ?? "").toLowerCase().includes(q)
        );
    }, [envelopes, debouncedQuery]);

    const sorted = useMemo(() => sortEnvelopes(filtered, sort), [filtered, sort]);
    // Grouped view: deadline / progress sorts are only meaningful for
    // goals — applying them across Monthly / Rolling reorders rows that
    // have no target by an irrelevant axis. Reorder the Goals group by
    // the requested sort, keep Monthly / Rolling on cadence order.
    const grouped3 = useMemo(() => {
        const cadenceSorted =
            sort === "deadline" || sort === "progress"
                ? sortEnvelopes(filtered, "cadence")
                : sorted;
        const groups = groupEnvelopes(cadenceSorted);
        if (sort === "deadline" || sort === "progress") {
            groups.goals = sortEnvelopes(groups.goals, sort);
        }
        return groups;
    }, [filtered, sorted, sort]);

    const totals = useMemo(() => {
        const allocated = envelopes.reduce(
            (s, e) => s + e.allocated + e.carryIn,
            0
        );
        const consumed = envelopes.reduce((s, e) => s + e.consumed, 0);
        const remaining = envelopes.reduce((s, e) => s + e.remaining, 0);
        const overAmount = envelopes.reduce(
            (s, e) =>
                s +
                Math.max(0, e.consumed - (e.allocated + e.carryIn)),
            0
        );
        const overCount = envelopes.filter(
            (e) => e.consumed > e.allocated + e.carryIn && e.allocated + e.carryIn > 0
        ).length;
        return { allocated, consumed, remaining, overAmount, overCount };
    }, [envelopes]);

    const monthLabel = viewingDate.toLocaleString("en-US", {
        month: "long",
        year: "numeric",
    });
    const daysLeft =
        monthOffset === 0
            ? Math.max(
                  0,
                  Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000)
              )
            : null;

    // Mid-month gentle nudge. After day 21 of the current month, surface a
    // one-time toast for each envelope that's already > 80% spent. Tracked
    // via localStorage so we don't spam — once per envelope per month.
    // Strict mode is the only thing that *blocks*; this is the soft layer.
    useEffect(() => {
        if (monthOffset !== 0) return;
        const today = new Date();
        if (today.getDate() < 21) return;
        const monthKey = `${today.getFullYear()}-${today.getMonth() + 1}`;
        const storageKey = `orbit:nudge:${space.id}:${monthKey}`;
        let dismissed: string[] = [];
        try {
            dismissed = JSON.parse(
                localStorage.getItem(storageKey) ?? "[]"
            );
        } catch {
            dismissed = [];
        }
        for (const e of envelopes) {
            if (e.cadence !== "monthly") continue;
            const total = e.allocated + e.carryIn;
            if (total <= 0) continue;
            const ratio = e.consumed / total;
            if (ratio < 0.8 || ratio > 1.5) continue;
            if (dismissed.includes(e.envelopId)) continue;
            const pct = Math.round(ratio * 100);
            toast.message(`${e.name} is ${pct}% spent`, {
                description: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left this month. Pull from another envelope, borrow from next month, or just stay aware.`,
                duration: 8000,
            });
            dismissed.push(e.envelopId);
        }
        try {
            localStorage.setItem(storageKey, JSON.stringify(dismissed));
        } catch {
            // localStorage might be disabled (private mode) — fail silently.
        }
        // We intentionally exclude `daysLeft` from the dep array — the
        // effect should fire when the envelope set materializes, not on
        // every minute as `now` shifts. envelopes is the meaningful trigger.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [envelopes, monthOffset, space.id]);

    const attention = useMemo(() => buildAttention(envelopes), [envelopes]);
    const priority = (priorityQuery.data ?? []).filter((p) => p.total > 0);
    const prioritySum = priority.reduce((s, p) => s + Number(p.total), 0);

    return (
        <div className="orbit-design env-root">
            <style>{ENV_STYLES}</style>

            {/* Topbar */}
            <header className="env-topbar">
                <div className="env-topbar-text">
                    <span className="eyebrow">
                        {monthLabel}
                        {daysLeft !== null
                            ? ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
                            : ""}
                    </span>
                    <h1 className="display env-title">Budgets</h1>
                    <p className="env-sub">
                        Envelopes that hold your monthly budget, and goals you're
                        saving toward.
                    </p>
                </div>
                <div className="env-topbar-actions">
                    <SortPicker sort={sort} setSort={setSort} />
                    <PermissionGate roles={["owner"]}>
                        <CreateOrEditEnvelopeDialog
                            trigger={
                                <button
                                    type="button"
                                    className="od-btn od-btn-primary"
                                >
                                    <Plus className="size-3.5" /> New envelope
                                </button>
                            }
                        />
                    </PermissionGate>
                </div>
            </header>

            <div className="env-scroll">
                {/* Period summary + Needs attention */}
                <div className="env-hero-grid">
                    <div className="od-card vignette env-hero">
                        <div className="env-hero-head">
                            <span className="eyebrow">
                                {monthLabel}
                                {daysLeft != null
                                    ? ` — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
                                    : ""}
                            </span>
                            <div className="env-hero-arrows">
                                <button
                                    type="button"
                                    className="env-hero-arrow"
                                    onClick={() => setMonthOffset((m) => m - 1)}
                                    aria-label="Previous month"
                                >
                                    <ChevronLeft className="size-3.5" />
                                </button>
                                <button
                                    type="button"
                                    className="env-hero-arrow"
                                    onClick={() => setMonthOffset((m) => m + 1)}
                                    disabled={monthOffset >= 0}
                                    aria-label="Next month"
                                >
                                    <ChevronRight className="size-3.5" />
                                </button>
                            </div>
                        </div>
                        {/* Banner is only meaningful for the current month —
                            spaceSummary.unallocated is always computed
                            against NOW on the server, so showing it on
                            past/future months would be misleading. */}
                        {summaryQuery.data && monthOffset === 0 && (
                            <UnbudgetedBanner
                                unallocated={summaryQuery.data.unallocated}
                                isOverAllocated={summaryQuery.data.isOverAllocated}
                                spaceId={space.id}
                                viewingDate={viewingDate}
                            />
                        )}
                        {monthOffset === 0 && (
                            <ReckoningBanner spaceId={space.id} />
                        )}
                        <div className="env-hero-stats">
                            <HeroStat
                                label="Allocated"
                                amount={totals.allocated}
                                sub={`across ${envelopes.length} envelope${envelopes.length === 1 ? "" : "s"}`}
                            />
                            <HeroStat
                                label="Spent"
                                amount={totals.consumed}
                                tone="brand"
                                sub={
                                    totals.allocated > 0
                                        ? `${((totals.consumed / totals.allocated) * 100).toFixed(0)}% of allocated`
                                        : ""
                                }
                            />
                            <HeroStat
                                label="Remaining"
                                amount={totals.remaining}
                                tone="gold"
                                sub={
                                    totals.overAmount > 0 ? (
                                        <span style={{ color: "var(--expense)" }}>
                                            −
                                            <Money
                                                amount={totals.overAmount}
                                                size={11}
                                                variant="expense"
                                            />{" "}
                                            over in {totals.overCount} envelope
                                            {totals.overCount === 1 ? "" : "s"}
                                        </span>
                                    ) : (
                                        "on track"
                                    )
                                }
                            />
                        </div>
                        {prioritySum > 0 && (
                            <div className="env-hero-priority">
                                <div className="env-hero-priority-head">
                                    <span className="eyebrow">Spent by priority</span>
                                    <Money
                                        amount={prioritySum}
                                        size={11}
                                        variant="muted"
                                    />
                                </div>
                                <div className="env-hero-priority-bar">
                                    {priority.map((p) => {
                                        const w = (Number(p.total) / prioritySum) * 100;
                                        return (
                                            <span
                                                key={p.priority}
                                                style={{
                                                    width: `${w}%`,
                                                    background: p.color,
                                                }}
                                                title={p.label}
                                            />
                                        );
                                    })}
                                </div>
                                <div className="env-hero-priority-legend">
                                    {priority.map((p) => (
                                        <span
                                            key={p.priority}
                                            className="env-priority-legend-cell"
                                        >
                                            <span
                                                className="env-priority-legend-dot"
                                                style={{ background: p.color }}
                                            />
                                            {p.label}{" "}
                                            <Money
                                                amount={Number(p.total)}
                                                size={11}
                                                variant="muted"
                                            />
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="od-card env-attention">
                        <div className="env-sect-head">
                            <h2 className="display env-sect-title">Needs attention</h2>
                            <span className="env-sect-sub">
                                {attention.length} envelope
                                {attention.length === 1 ? "" : "s"}
                            </span>
                        </div>
                        {attention.length === 0 ? (
                            <div className="env-attention-empty">
                                <Check
                                    className="size-4"
                                    style={{ color: "var(--income)" }}
                                />
                                Everything's on track.
                            </div>
                        ) : (
                            <div className="env-attention-list">
                                {attention.slice(0, 6).map((a) => (
                                    <Link
                                        key={a.envelopId}
                                        to={ROUTES.spaceBudgetDetail(
                                            space.id,
                                            a.envelopId
                                        )}
                                        className="env-attention-row"
                                    >
                                        <span className="env-attention-row-name">
                                            <EntityAvatar
                                                icon={a.icon}
                                                colorVar={a.color}
                                                size={26}
                                            />
                                            <span>
                                                <span className="env-attention-title">
                                                    {a.name}
                                                </span>
                                                <span className="env-attention-text">
                                                    {a.text}
                                                </span>
                                            </span>
                                        </span>
                                        <ChevronRightIcon
                                            className="size-3.5"
                                            style={{ color: "var(--fg-4)" }}
                                        />
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Search + view toggle */}
                <div className="env-toolbar">
                    <label className="env-search">
                        <Search
                            className="size-3.5"
                            style={{ color: "var(--fg-4)" }}
                        />
                        <input
                            className="od-input env-search-input"
                            placeholder="Search envelopes…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </label>
                    <div className="env-view-toggle">
                        {(
                            [
                                { v: "grouped", label: "Grouped", icon: FolderIcon },
                                { v: "list", label: "List", icon: ListIcon },
                                { v: "grid", label: "Grid", icon: Grid3x3 },
                            ] as const
                        ).map((b) => (
                            <button
                                key={b.v}
                                type="button"
                                className={`env-view-cell ${view === b.v ? "is-active" : ""}`}
                                onClick={() => setView(b.v)}
                            >
                                <b.icon
                                    className="size-3"
                                    style={{
                                        color:
                                            view === b.v
                                                ? "var(--brand)"
                                                : "var(--fg-3)",
                                    }}
                                />
                                {b.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                {utilizationQuery.isLoading ? (
                    <div className="env-grid">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                            <Skeleton key={i} height={160} />
                        ))}
                    </div>
                ) : envelopes.length === 0 ? (
                    <div className="od-card env-empty">
                        <Mail className="size-6" style={{ color: "var(--fg-4)" }} />
                        <div
                            style={{
                                fontSize: 14,
                                color: "var(--fg-2)",
                                fontWeight: 500,
                            }}
                        >
                            No budgets yet
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--fg-4)" }}>
                            Create an envelope for monthly spending, or a goal
                            for long-term saving.
                        </div>
                        <PermissionGate roles={["owner"]}>
                            <CreateOrEditEnvelopeDialog
                                trigger={
                                    <button className="od-btn od-btn-primary">
                                        <Plus className="size-3.5" /> New envelope
                                    </button>
                                }
                            />
                        </PermissionGate>
                    </div>
                ) : sorted.length === 0 ? (
                    <div
                        className="od-card"
                        style={{
                            padding: 40,
                            textAlign: "center",
                            color: "var(--fg-3)",
                        }}
                    >
                        No envelopes match &ldquo;{debouncedQuery}&rdquo;.
                    </div>
                ) : view === "grid" ? (
                    <div className="env-grid">
                        {sorted.map((e) => (
                            <EnvelopeCard
                                key={e.envelopId}
                                env={e}
                                spaceId={space.id}
                            />
                        ))}
                    </div>
                ) : view === "list" ? (
                    <div className="od-card env-list">
                        {sorted.map((e, i) => (
                            <EnvelopeListRow
                                key={e.envelopId}
                                env={e}
                                spaceId={space.id}
                                last={i === sorted.length - 1}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="env-groups">
                        {(
                            [
                                {
                                    key: "monthly" as const,
                                    label: "Monthly · resets on the 1st",
                                },
                                {
                                    key: "goals" as const,
                                    label: "Goals · long-term targets",
                                },
                                {
                                    key: "rolling" as const,
                                    label: "Rolling · accumulates",
                                },
                            ]
                        ).map(({ key, label }) => {
                            const items = grouped3[key];
                            if (!items || items.length === 0) return null;
                            return (
                                <div key={key} className="env-group">
                                    <div className="env-group-head">
                                        <span className="eyebrow">{label}</span>
                                        <span className="env-group-count">
                                            {items.length}{" "}
                                            {key === "goals"
                                                ? `goal${items.length === 1 ? "" : "s"}`
                                                : `envelope${items.length === 1 ? "" : "s"}`}
                                        </span>
                                    </div>
                                    <div className="od-card env-list">
                                        {items.map((e, i) => (
                                            <EnvelopeListRow
                                                key={e.envelopId}
                                                env={e}
                                                spaceId={space.id}
                                                last={i === items.length - 1}
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {archivedEnvelopes.length > 0 && (
                    <div className="env-archived-section">
                        <button
                            type="button"
                            className="env-archived-toggle"
                            onClick={() => setShowArchived((v) => !v)}
                        >
                            {showArchived ? "Hide" : "Show"} archived
                            <span className="env-archived-count">
                                {archivedEnvelopes.length}
                            </span>
                            <ChevronDown
                                className="size-3"
                                style={{
                                    transform: showArchived
                                        ? "rotate(180deg)"
                                        : "none",
                                    transition: "transform 140ms ease",
                                }}
                            />
                        </button>
                        {showArchived && (
                            <div className="env-grid env-archived-grid">
                                {archivedEnvelopes.map((e) => (
                                    <EnvelopeCard
                                        key={e.envelopId}
                                        env={e}
                                        spaceId={space.id}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ============================================================
   Card / row renderers
   ============================================================ */

function EnvelopeCard({
    env,
    spaceId,
}: {
    env: EnvelopeRow;
    spaceId: string;
}) {
    // Period-scoped pool: only positive carry adds to what's available
    // this period. Negative carry (carry='both' debt) is already deducted
    // from net worth — it must NOT trigger the "drift/over" state on
    // envelopes that haven't actually overspent this period.
    const total = env.allocated + Math.max(0, env.carryIn);
    const remaining = total - env.consumed;
    const overBy = env.consumed - total;
    const drift = env.consumed > total;
    const drainV =
        total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
    const pctSpent =
        total > 0 ? env.consumed / total : env.consumed > 0 ? Infinity : 0;
    const isGoal = env.targetAmount != null;
    const goalSaved = env.lifetimeFunded ?? 0;
    const goalPct =
        isGoal && env.targetAmount && env.targetAmount > 0
            ? Math.max(0, Math.min(1, goalSaved / env.targetAmount))
            : 0;
    const targetDate = env.targetDate ? new Date(env.targetDate) : null;

    return (
        <Link
            to={ROUTES.spaceBudgetDetail(spaceId, env.envelopId)}
            className={`od-card env-card${isGoal ? " env-card-goal" : ""}${env.archived ? " env-card-archived" : ""}`}
        >
            <div className="env-card-head">
                <span className="env-card-name">
                    <EntityAvatar icon={env.icon} colorVar={env.color} size={32} />
                    <span className="env-card-text">
                        <span className="env-card-title">
                            {env.name}
                            {env.archived && (
                                <span className="env-archived-pill">
                                    Archived
                                </span>
                            )}
                        </span>
                        <span className="env-card-cadence">
                            <span>
                                {isGoal
                                    ? "Goal"
                                    : env.cadence === "monthly"
                                      ? "Monthly"
                                      : "Rolling"}
                            </span>
                            {isGoal && targetDate && (
                                <>
                                    <span aria-hidden>·</span>
                                    <span style={{ color: "var(--fg-3)" }}>
                                        by{" "}
                                        {targetDate.toLocaleDateString("en-US", {
                                            month: "short",
                                            year: "numeric",
                                        })}
                                    </span>
                                </>
                            )}
                            {drift && (
                                <>
                                    <span aria-hidden>·</span>
                                    <span style={{ color: "var(--expense)" }}>
                                        drift
                                    </span>
                                </>
                            )}
                            {(env.lifetimeOverrun ?? 0) > 0 && (
                                <>
                                    <span aria-hidden>·</span>
                                    {/* LEDGER-REPLACEABLE: drops when the
                                        envelop_allocations ledger expresses
                                        overspend via 'reckon' rows. */}
                                    <span
                                        style={{ color: "var(--expense)" }}
                                        title={`This rolling envelope has spent ${(env.lifetimeOverrun ?? 0).toFixed(2)} more than allocated across all time.`}
                                        aria-label={`Net overspent across all time by ${(env.lifetimeOverrun ?? 0).toFixed(2)}`}
                                    >
                                        net overspent (lifetime){" "}
                                        <Money
                                            amount={env.lifetimeOverrun ?? 0}
                                            size={11}
                                            variant="expense"
                                        />
                                    </span>
                                </>
                            )}
                        </span>
                    </span>
                </span>
                <EnvelopeMenu env={env} />
            </div>
            {isGoal ? (
                <>
                    <div className="env-card-amt-row">
                        <Money amount={goalSaved} size={26} variant="neutral" />
                        <span className="env-card-of">
                            saved of{" "}
                            <Money
                                amount={env.targetAmount ?? 0}
                                variant="muted"
                                size={11}
                            />
                        </span>
                    </div>
                    <ProgressBar value={goalPct} color={env.color} height={5} />
                    <div className="env-card-foot">
                        {goalSaved > (env.targetAmount ?? 0) ? (
                            <span
                                style={{
                                    color: "var(--gold)",
                                    fontWeight: 500,
                                }}
                            >
                                Over-funded by{" "}
                                <Money
                                    amount={goalSaved - (env.targetAmount ?? 0)}
                                    size={11}
                                />
                            </span>
                        ) : (
                            <span style={{ color: "var(--fg-4)" }}>
                                {`${Math.round(goalPct * 100)}% complete`}
                            </span>
                        )}
                        <span style={{ color: "var(--fg-4)" }}>
                            {env.consumed > 0 ? (
                                <>
                                    spent{" "}
                                    <Money
                                        amount={env.consumed}
                                        size={11}
                                        variant="muted"
                                    />
                                </>
                            ) : null}
                        </span>
                    </div>
                </>
            ) : (
                <>
                    <div className="env-card-amt-row">
                        <Money
                            amount={Math.abs(remaining)}
                            size={26}
                            variant={drift ? "expense" : "neutral"}
                        />
                        <span className="env-card-of">
                            {drift ? (
                                "over budget"
                            ) : total > 0 ? (
                                <>
                                    left of{" "}
                                    <Money amount={total} variant="muted" size={11} />
                                </>
                            ) : (
                                "no budget"
                            )}
                        </span>
                    </div>
                    <ProgressBar
                        value={drift ? 1 : drainV}
                        color={drift ? "var(--expense)" : env.color}
                        height={5}
                    />
                    <div className="env-card-foot">
                        <span
                            style={{
                                color: drift ? "var(--expense)" : "var(--fg-4)",
                            }}
                        >
                            {Number.isFinite(pctSpent)
                                ? `${Math.round(pctSpent * 100)}% spent`
                                : "spent without budget"}
                        </span>
                        <span style={{ color: "var(--fg-4)" }}>
                            {drift && (
                                <>
                                    over{" "}
                                    <Money
                                        amount={Math.abs(overBy)}
                                        size={11}
                                        variant="expense"
                                    />
                                </>
                            )}
                        </span>
                    </div>
                </>
            )}
        </Link>
    );
}

function EnvelopeListRow({
    env,
    spaceId,
    last,
}: {
    env: EnvelopeRow;
    spaceId: string;
    last: boolean;
}) {
    const total = env.allocated + Math.max(0, env.carryIn);
    const remaining = total - env.consumed;
    const drift = env.consumed > total;
    const drainV =
        total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
    const isGoal = env.targetAmount != null;
    const goalSaved = env.lifetimeFunded ?? 0;
    const goalPct =
        isGoal && env.targetAmount && env.targetAmount > 0
            ? Math.max(0, Math.min(1, goalSaved / env.targetAmount))
            : 0;
    const targetDate = env.targetDate ? new Date(env.targetDate) : null;
    return (
        <Link
            to={ROUTES.spaceBudgetDetail(spaceId, env.envelopId)}
            className={`env-list-row${isGoal ? " env-list-row-goal" : ""}`}
            style={{
                borderBottom: last ? "none" : "1px solid var(--line-soft)",
            }}
        >
            <div className="env-list-row-name">
                <EntityAvatar icon={env.icon} colorVar={env.color} size={26} />
                <div className="env-list-row-text">
                    <div className="env-list-row-title">{env.name}</div>
                    <div className="env-list-row-cadence">
                        {isGoal
                            ? "Goal"
                            : env.cadence === "monthly"
                              ? "Monthly"
                              : "Rolling"}
                        {isGoal && targetDate && (
                            <>
                                {" · "}
                                <span style={{ color: "var(--fg-3)" }}>
                                    by{" "}
                                    {targetDate.toLocaleDateString("en-US", {
                                        month: "short",
                                        year: "numeric",
                                    })}
                                </span>
                            </>
                        )}
                        {drift && (
                            <>
                                {" "}
                                ·{" "}
                                <span style={{ color: "var(--expense)" }}>drift</span>
                            </>
                        )}
                        {/* LEDGER-REPLACEABLE: drops when the
                            envelop_allocations ledger expresses overspend
                            via 'reckon' rows. */}
                        {(env.lifetimeOverrun ?? 0) > 0 && (
                            <>
                                {" · "}
                                <span
                                    style={{ color: "var(--expense)" }}
                                    title={`Net overspent across all time by ${(env.lifetimeOverrun ?? 0).toFixed(2)}.`}
                                    aria-label={`Net overspent across all time by ${(env.lifetimeOverrun ?? 0).toFixed(2)}`}
                                >
                                    net −
                                    {(env.lifetimeOverrun ?? 0).toLocaleString(
                                        "en-US",
                                        { maximumFractionDigits: 0 }
                                    )}
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <div className="env-list-row-bar">
                <ProgressBar
                    value={isGoal ? goalPct : drift ? 1 : drainV}
                    color={isGoal ? env.color : drift ? "var(--expense)" : env.color}
                    height={4}
                />
            </div>
            <div className="env-list-row-amt">
                {isGoal ? (
                    <>
                        <Money amount={goalSaved} size={12.5} variant="neutral" />{" "}
                        <span style={{ color: "var(--fg-4)" }}>
                            of{" "}
                            <Money
                                amount={env.targetAmount ?? 0}
                                size={11}
                                variant="muted"
                            />
                        </span>
                    </>
                ) : (
                    <>
                        <Money
                            amount={Math.abs(remaining)}
                            size={12.5}
                            variant={drift ? "expense" : "neutral"}
                        />{" "}
                        <span style={{ color: "var(--fg-4)" }}>
                            {drift ? (
                                "over budget"
                            ) : total > 0 ? (
                                <>
                                    left of{" "}
                                    <Money
                                        amount={total}
                                        size={12.5}
                                        variant="muted"
                                    />
                                </>
                            ) : (
                                "no budget"
                            )}
                        </span>
                    </>
                )}
            </div>
            <ChevronRightIcon
                className="size-3.5"
                style={{ color: "var(--fg-4)" }}
            />
        </Link>
    );
}

function EnvelopeMenu({ env }: { env: EnvelopeRow }) {
    const [editOpen, setEditOpen] = useState(false);
    const [moveOpen, setMoveOpen] = useState(false);
    const [topUpOpen, setTopUpOpen] = useState(false);
    return (
        // EnvelopeCard wraps everything in a <Link>, so we need to stop the
        // menu/dialog clicks from bubbling up and triggering navigation.
        // stopPropagation alone is enough — preventDefault would also cancel
        // browser defaults like `<label>` → input activation, which silently
        // kills the carry-policy radios inside the edit modal (Radix portals
        // the dialog out of the DOM, but synthetic events still bubble up
        // through the React component tree).
        <span onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className="env-card-menu"
                        aria-label="More"
                    >
                        <MoreHorizontal className="size-3.5" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    {!env.archived && (
                        <PermissionGate roles={["owner", "editor"]}>
                            <EnvelopeAllocateDialog
                                envelopId={env.envelopId}
                                envelopCadence={env.cadence as Cadence}
                                direction="allocate"
                            />
                            <EnvelopeAllocateDialog
                                envelopId={env.envelopId}
                                envelopCadence={env.cadence as Cadence}
                                direction="deallocate"
                            />
                            <DropdownMenuItem
                                onSelect={(e) => {
                                    e.preventDefault();
                                    setTopUpOpen(true);
                                }}
                            >
                                <Coins className="size-3.5" /> Top up…
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={(e) => {
                                    e.preventDefault();
                                    setMoveOpen(true);
                                }}
                            >
                                <ArrowRightLeft className="size-3.5" /> Move to…
                            </DropdownMenuItem>
                        </PermissionGate>
                    )}
                    <PermissionGate roles={["owner"]}>
                        {!env.archived && (
                            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                                <Pencil className="size-3.5" /> Edit envelope
                            </DropdownMenuItem>
                        )}
                        <ArchiveEnvelopeMenuItem
                            envelopId={env.envelopId}
                            envelopName={env.name}
                            archived={env.archived}
                            currentRemaining={env.remaining}
                        />
                        {!env.archived && (
                            <DeleteEnvelopeMenuItem
                                envelopId={env.envelopId}
                            />
                        )}
                    </PermissionGate>
                </DropdownMenuContent>
            </DropdownMenu>
            <CreateOrEditEnvelopeDialog
                envelope={env}
                open={editOpen}
                onOpenChange={setEditOpen}
                hideDefaultTrigger
            />
            <EnvelopeMoveDialog
                sourceEnvelopId={env.envelopId}
                sourceEnvelopeName={env.name}
                sourceEnvelopeColor={env.color}
                open={moveOpen}
                onOpenChange={setMoveOpen}
                hideDefaultTrigger
            />
            <EnvelopeTopUpDialog
                envelopId={env.envelopId}
                envelopeName={env.name}
                envelopeCadence={env.cadence as Cadence}
                envelopeColor={env.color}
                open={topUpOpen}
                onOpenChange={setTopUpOpen}
                hideDefaultTrigger
            />
        </span>
    );
}

/* ============================================================
   Helpers
   ============================================================ */

function ReckoningBanner({ spaceId }: { spaceId: string }) {
    // Pulls the count of unresolved past-month overspends. Shows nothing
    // when zero — the dashboard stays clean unless the user actually has
    // something to settle.
    const pendingQuery = trpc.reckoning.listPending.useQuery({ spaceId });
    const items = pendingQuery.data ?? [];
    if (items.length === 0) return null;
    const total = items.reduce((s, i) => s + i.overBy, 0);
    return (
        <Link
            to={ROUTES.spaceReckoning(spaceId)}
            className="env-reckoning-banner"
        >
            <span className="env-reckoning-dot" />
            <span className="env-reckoning-text">
                <span className="env-reckoning-title">
                    {items.length} past-month overspend
                    {items.length === 1 ? "" : "s"} need
                    {items.length === 1 ? "s" : ""} attention
                </span>
                <span className="env-reckoning-sub">
                    Total {total.toFixed(2)} across{" "}
                    {new Set(items.map((i) => i.envelopId)).size} envelope
                    {new Set(items.map((i) => i.envelopId)).size === 1
                        ? ""
                        : "s"}
                    . Decide how to settle.
                </span>
            </span>
            <span className="env-reckoning-cta">Settle →</span>
        </Link>
    );
}

function UnbudgetedBanner({
    unallocated,
    isOverAllocated,
    spaceId,
    viewingDate,
}: {
    unallocated: number;
    isOverAllocated: boolean;
    spaceId: string;
    viewingDate: Date;
}) {
    const monthSlug = `${viewingDate.getFullYear()}-${String(
        viewingDate.getMonth() + 1
    ).padStart(2, "0")}`;
    const tone = isOverAllocated ? "var(--expense)" : "var(--income)";
    const title = isOverAllocated ? "Over-budgeted by" : "Unbudgeted";
    const value = Math.abs(unallocated);
    const sub = isOverAllocated
        ? "Your envelopes hold more than your accounts have. Add income or reduce an envelope."
        : "Money in your accounts that isn't planned for anything yet.";

    // 90-day drain breakdown — surfaces silent overspend absorption that
    // would otherwise drain the pool invisibly.
    const trendQuery = trpc.analytics.unbudgetedTrend.useQuery({
        spaceId,
        windowDays: 90,
    });
    const [showBreakdown, setShowBreakdown] = useState(false);
    const t = trendQuery.data;

    return (
        <div className="env-unbudgeted">
            <div className="env-unbudgeted-cell">
                <span
                    className="env-unbudgeted-dot"
                    style={{ background: tone }}
                />
                <span className="env-unbudgeted-text">
                    <span className="env-unbudgeted-title">
                        {title}{" "}
                        <span
                            className="tabular"
                            style={{
                                fontWeight: 600,
                                color: tone,
                                marginLeft: 4,
                            }}
                        >
                            {isOverAllocated ? "−" : "+"}
                            {value.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}
                        </span>
                        {t && t.absorbedOverspend > 0 && (
                            <button
                                type="button"
                                className="env-unbudgeted-trend"
                                onClick={() => setShowBreakdown((v) => !v)}
                                title="See what's drained the pool over the last 90 days"
                            >
                                ↓ {t.absorbedOverspend.toFixed(0)} silent
                                overspend (90d)
                            </button>
                        )}
                    </span>
                    <span className="env-unbudgeted-sub">{sub}</span>
                    {showBreakdown && t && (
                        <div className="env-unbudgeted-breakdown">
                            <div className="env-unbudgeted-breakdown-row">
                                <span>Income</span>
                                <span className="tabular">
                                    +{t.income.toFixed(2)}
                                </span>
                            </div>
                            <div className="env-unbudgeted-breakdown-row">
                                <span>Net new allocations</span>
                                <span
                                    className="tabular"
                                    style={{
                                        color:
                                            t.allocationsNet > 0
                                                ? "var(--expense)"
                                                : "var(--income)",
                                    }}
                                >
                                    {t.allocationsNet > 0 ? "−" : "+"}
                                    {Math.abs(t.allocationsNet).toFixed(2)}
                                </span>
                            </div>
                            <div className="env-unbudgeted-breakdown-row env-unbudgeted-breakdown-emph">
                                <span>Silent overspend absorbed</span>
                                <span
                                    className="tabular"
                                    style={{ color: "var(--expense)" }}
                                >
                                    −{t.absorbedOverspend.toFixed(2)}
                                </span>
                            </div>
                            <div className="env-unbudgeted-breakdown-hint">
                                Switch overspending envelopes to "Honest"
                                carry mode to make this leak persist as
                                debt instead of vanishing.
                            </div>
                        </div>
                    )}
                </span>
            </div>
            <Link
                to={ROUTES.spaceBudgetMonth(spaceId, monthSlug)}
                className="env-unbudgeted-cta"
            >
                Budget this month →
            </Link>
        </div>
    );
}

function HeroStat({
    label,
    amount,
    tone,
    sub,
}: {
    label: string;
    amount: number;
    tone?: "fg" | "brand" | "gold";
    sub?: ReactNode;
}) {
    const color =
        tone === "brand"
            ? "var(--brand)"
            : tone === "gold"
              ? "var(--gold)"
              : "var(--fg)";
    return (
        <div className="env-hero-stat">
            <span className="eyebrow">{label}</span>
            <span
                className="tabular"
                style={{
                    fontSize: 28,
                    fontWeight: 500,
                    color,
                    letterSpacing: "-0.04em",
                    marginTop: 2,
                }}
            >
                {amount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                })}
            </span>
            {sub && <span className="env-hero-stat-sub">{sub}</span>}
        </div>
    );
}

function Money({
    amount,
    variant = "neutral",
    signed = false,
    size = 13,
    weight = 500,
    decimals = 2,
}: {
    amount: number;
    variant?: "neutral" | "income" | "expense" | "muted";
    signed?: boolean;
    size?: number;
    weight?: number;
    decimals?: number;
}) {
    const colorMap: Record<string, string> = {
        income: "var(--income)",
        expense: "var(--expense)",
        muted: "var(--fg-3)",
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
            style={{
                color: colorMap[variant],
                fontSize: size,
                fontWeight: weight,
                letterSpacing: size >= 24 ? "-0.04em" : undefined,
            }}
        >
            {text}
        </span>
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
            style={{
                width: size,
                height: size,
                borderRadius: 8,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: `color-mix(in oklab, ${colorVar} 18%, transparent)`,
                border: `1px solid color-mix(in oklab, ${colorVar} 30%, transparent)`,
                color: colorVar,
                flexShrink: 0,
            }}
        >
            <DesignIcon name={icon} size={size * 0.5} color={colorVar} />
        </span>
    );
}

const ICON_PATHS: Record<string, string> = {
    home: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
    cart: "M3 4h2l3 12h11l2-8H7M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    coffee:
        "M5 8h12v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zm12 1h2a2 2 0 1 1 0 4h-2zM7 4v2M11 4v2M15 4v2",
    car: "M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13m-14 0v5h2v-2h10v2h2v-5m-14 0h14",
    book: "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM4 17a3 3 0 0 1 3-3h11",
    flame: "M12 22s7-4 7-10c0-3-2-5-3-6 0 2-1 3-2 3-1-3-3-5-3-7-2 1-6 5-6 10 0 6 7 10 7 10z",
    bolt: "M13 2 3 14h7l-1 8 10-12h-7z",
    music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zm11-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3z",
    camera: "M3 8h4l2-3h6l2 3h4v11H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
    dumbbell: "M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12",
    mail: "M4 6h16v12H4z M4 6l8 6 8-6",
    layers: "m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5M3 17l9 5 9-5",
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
    const d = ICON_PATHS[name] ?? ICON_PATHS.mail;
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

function ProgressBar({
    value,
    color = "var(--brand)",
    height = 6,
}: {
    value: number;
    color?: string;
    height?: number;
}) {
    const v = Math.max(0, Math.min(1.5, value));
    const over = v > 1;
    return (
        <div
            style={{
                height,
                borderRadius: 999,
                background: "var(--bg-elev-3)",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    height: "100%",
                    width: `${Math.min(v, 1) * 100}%`,
                    background: over ? "var(--expense)" : color,
                    borderRadius: 999,
                }}
            />
        </div>
    );
}

function Skeleton({ height = 16 }: { height?: number }) {
    return (
        <div
            style={{
                width: "100%",
                height,
                borderRadius: 12,
                background:
                    "linear-gradient(90deg, var(--bg-elev-1), var(--bg-elev-2), var(--bg-elev-1))",
                backgroundSize: "200% 100%",
                animation: "ov-shimmer 1.6s ease-in-out infinite",
            }}
        />
    );
}

function SortPicker({
    sort,
    setSort,
}: {
    sort: SortMode;
    setSort: (v: SortMode) => void;
}) {
    const label =
        SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Cadence";
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button type="button" className="od-btn">
                    <FilterIcon className="size-3.5" /> Sort: {label}
                    <ChevronDown
                        className="size-3"
                        style={{ color: "var(--fg-4)" }}
                    />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className="orbit-design env-popover w-52 p-1"
            >
                {SORT_OPTIONS.map((o) => {
                    // Deadline + Progress are goal-only axes; in the
                    // grouped view they reorder the Goals section but
                    // leave Monthly + Rolling on cadence order so the
                    // page doesn't look broken under those sorts.
                    const isGoalOnly =
                        o.value === "deadline" || o.value === "progress";
                    return (
                        <button
                            key={o.value}
                            type="button"
                            className="env-popover-item env-sort-item"
                            onClick={() => setSort(o.value)}
                        >
                            <span className="env-sort-item-text">
                                {o.label}
                                {isGoalOnly && (
                                    <span className="env-sort-item-sub">
                                        Reorders Goals only
                                    </span>
                                )}
                            </span>
                            {sort === o.value && (
                                <Check
                                    className="ml-auto size-3.5"
                                    style={{ color: "var(--brand)" }}
                                />
                            )}
                        </button>
                    );
                })}
            </PopoverContent>
        </Popover>
    );
}

/* ============================================================
   Dialogs (preserved)
   ============================================================ */

type CarryPolicy = "reset" | "positive_only" | "both";

export interface EditableEnvelope {
    envelopId: string;
    name: string;
    color: string;
    icon: string;
    description: string | null;
    cadence: Cadence;
    carryOver: boolean;
    carryPolicy?: CarryPolicy;
    targetAmount?: number | null;
    targetDate?: Date | string | null;
}

export function CreateOrEditEnvelopeDialog({
    envelope,
    open: controlledOpen,
    onOpenChange,
    hideDefaultTrigger,
    trigger,
}: {
    envelope?: EditableEnvelope;
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
    hideDefaultTrigger?: boolean;
    trigger?: ReactNode;
}) {
    const { space } = useCurrentSpace();
    const utils = trpc.useUtils();
    const editing = !!envelope;
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const open = controlledOpen ?? uncontrolledOpen;
    const setOpen = onOpenChange ?? setUncontrolledOpen;
    const [name, setName] = useState(envelope?.name ?? "");
    const [color, setColor] = useState(envelope?.color ?? DEFAULT_COLOR);
    const [icon, setIcon] = useState(envelope?.icon ?? "mail");
    const [description, setDescription] = useState(envelope?.description ?? "");
    const [cadence, setCadence] = useState<Cadence>(envelope?.cadence ?? "none");
    // Three-mode carry policy. Defaults derive from the legacy boolean for
    // existing envelopes that haven't been re-saved yet.
    const [carryPolicy, setCarryPolicy] = useState<CarryPolicy>(
        envelope?.carryPolicy ??
            (envelope?.carryOver ? "positive_only" : "reset")
    );
    const [targetAmount, setTargetAmount] = useState<string>(
        envelope?.targetAmount != null ? String(envelope.targetAmount) : ""
    );
    const [targetDate, setTargetDate] = useState<string>(
        envelope?.targetDate
            ? new Date(envelope.targetDate).toISOString().slice(0, 10)
            : ""
    );

    const invalidate = async () => {
        await utils.envelop.listBySpace.invalidate({ spaceId: space.id });
        await utils.analytics.envelopeUtilization.invalidate({ spaceId: space.id });
    };

    const idem = useIdempotencyKey();
    const create = trpc.envelop.create.useMutation({
        onSuccess: async () => {
            toast.success("Envelope created");
            idem.rotate();
            await invalidate();
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });
    const update = trpc.envelop.update.useMutation({
        onSuccess: async () => {
            toast.success("Envelope updated");
            await invalidate();
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });
    const pending = create.isPending || update.isPending;

    const submit = () => {
        if (pending) return;
        if (!name.trim()) return;
        const carryOverBool = carryPolicy !== "reset";
        // Targets only ride along on rolling (cadence='none') envelopes.
        // Server validates the same constraint; we mirror it here so the
        // submit button can't ship contradictory state.
        const parsedAmountRaw =
            cadence === "none" && targetAmount.trim()
                ? Number(targetAmount)
                : null;
        const parsedTargetAmount =
            parsedAmountRaw != null && Number.isFinite(parsedAmountRaw)
                ? parsedAmountRaw
                : null;
        // `<input type="date">` emits "YYYY-MM-DD". `new Date(s)` would
        // parse it as UTC midnight and then PG's session-tz conversion
        // could shift the stored `date` column by one day for any user
        // outside Asia/Dhaka — use the APP_TZ-aware builder instead.
        let parsedTargetDate: Date | null = null;
        if (cadence === "none" && targetDate.trim()) {
            const [yStr, mStr, dStr] = targetDate.split("-");
            const y = Number(yStr);
            const m = Number(mStr);
            const d = Number(dStr);
            if (
                Number.isFinite(y) &&
                Number.isFinite(m) &&
                Number.isFinite(d)
            ) {
                parsedTargetDate = makeAppTzDate(y, m - 1, d);
            }
        }
        if (editing) {
            // Only include target fields in the update payload when the
            // user actually changed them. The form initializes from the
            // stored row, so an untouched field would otherwise echo the
            // stored value back as an explicit write — and a stored-null
            // field would echo `null`, which the server reads as an
            // intentional clear and lock-step cascades the other column.
            // Track change vs the original envelope's serialized state.
            const origAmountStr =
                envelope?.targetAmount != null
                    ? String(envelope.targetAmount)
                    : "";
            const origDateStr = envelope?.targetDate
                ? new Date(envelope.targetDate).toISOString().slice(0, 10)
                : "";
            const amountChanged = targetAmount !== origAmountStr;
            const dateChanged = targetDate !== origDateStr;
            update.mutate({
                envelopId: envelope!.envelopId,
                name: name.trim(),
                color,
                icon,
                description: description.trim() || null,
                cadence,
                carryOver: carryOverBool,
                carryPolicy,
                ...(amountChanged ? { targetAmount: parsedTargetAmount } : {}),
                ...(dateChanged ? { targetDate: parsedTargetDate } : {}),
            });
        } else {
            create.mutate({
                spaceId: space.id,
                name: name.trim(),
                color,
                icon,
                description: description.trim() || undefined,
                cadence,
                carryOver: carryOverBool,
                carryPolicy,
                targetAmount: parsedTargetAmount ?? undefined,
                targetDate: parsedTargetDate ?? undefined,
                idempotencyKey: idem.key,
            });
        }
    };

    const IconCmp = getIcon(icon);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {!hideDefaultTrigger && (
                <DialogTrigger asChild>
                    {trigger ??
                        (editing ? (
                            <Button size="icon" variant="ghost" className="size-7">
                                <Pencil className="size-3.5" />
                            </Button>
                        ) : (
                            <Button variant="gradient">
                                <Plus />
                                New envelope
                            </Button>
                        ))}
                </DialogTrigger>
            )}
            <DialogContent className="orbit-shell-host">
                <DialogTitle className="sr-only">
                    {editing ? "Edit envelope" : "Create envelope"}
                </DialogTitle>
                <OrbitModalShell
                    width={560}
                    eyebrow="Budgets"
                    title={editing ? "Edit envelope" : "New envelope"}
                    subtitle="A bucket for a category — funded, tracked, and rolled-over."
                    leadIcon={<IconCmp className="size-4" />}
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
                                disabled={!name.trim() || pending}
                                onClick={submit}
                            >
                                <Plus className="size-3.5" />
                                {pending
                                    ? "Saving…"
                                    : editing
                                      ? "Save changes"
                                      : "Create envelope"}
                            </button>
                        </>
                    }
                >
                    <OrbitFormStyles />
                    <style>{ENV_MODAL_STYLES}</style>

                    {/* Color/icon row + Name */}
                    <div className="env-mod-id-row">
                        <div className="env-mod-style-row">
                            <ColorPickerButton value={color} onChange={setColor} />
                            <IconPickerButton
                                value={icon}
                                onChange={setIcon}
                                color={color}
                            />
                        </div>
                        <div className="env-mod-name-wrap">
                            <OrbitField label="Name" required>
                                <OrbitInput
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Groceries, Entertainment…"
                                    required
                                    maxLength={255}
                                    autoFocus
                                />
                            </OrbitField>
                        </div>
                    </div>

                    <OrbitField label="Description" hint="Optional">
                        <OrbitTextarea
                            rows={2}
                            maxLength={2000}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What does this envelope cover?"
                        />
                    </OrbitField>

                    <OrbitFieldRow>
                        <OrbitField label="Cadence">
                            <OrbitSelect
                                value={cadence}
                                onValueChange={(v) => setCadence(v as Cadence)}
                                items={[
                                    {
                                        value: "none",
                                        label: "Rolling (accumulates)",
                                    },
                                    {
                                        value: "monthly",
                                        label: "Monthly (resets on the 1st)",
                                    },
                                ]}
                                placeholder="Choose cadence"
                            />
                        </OrbitField>
                        {cadence !== "none" ? (
                            <OrbitField
                                label="Carry policy"
                                // OrbitField defaults to a <label> wrapper.
                                // Radio rows already render one <label> per
                                // option; nested labels make the outer one
                                // steal every click back to the first input.
                                interactiveHint
                                hint={
                                    carryPolicy === "both"
                                        ? "Surplus AND debt persist"
                                        : carryPolicy === "positive_only"
                                          ? "Surplus rolls forward"
                                          : "Fresh slate every month"
                                }
                            >
                                <OrbitRadioRow
                                    name="env-carry-policy"
                                    value={carryPolicy}
                                    onChange={(v) =>
                                        setCarryPolicy(v as CarryPolicy)
                                    }
                                    options={[
                                        {
                                            value: "reset",
                                            label: "Reset",
                                            hint: "Both directions",
                                        },
                                        {
                                            value: "positive_only",
                                            label: "Surplus",
                                            hint: "Carry unspent",
                                        },
                                        {
                                            value: "both",
                                            label: "Honest",
                                            hint: "Carry both",
                                        },
                                    ]}
                                />
                            </OrbitField>
                        ) : (
                            <div />
                        )}
                    </OrbitFieldRow>

                    {/* Goal target — only on rolling envelopes. Both fields
                       are optional; setting either turns the envelope into
                       a goal card with a progress bar. */}
                    {cadence === "none" ? (
                        <OrbitFieldRow>
                            <OrbitField
                                label="Target amount"
                                hint="Optional — turns this envelope into a goal"
                            >
                                <OrbitInput
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    step="0.01"
                                    value={targetAmount}
                                    onChange={(e) =>
                                        setTargetAmount(e.target.value)
                                    }
                                    placeholder="0.00"
                                />
                            </OrbitField>
                            <OrbitField label="Target date" hint="Optional">
                                <OrbitInput
                                    type="date"
                                    value={targetDate}
                                    onChange={(e) => setTargetDate(e.target.value)}
                                />
                            </OrbitField>
                        </OrbitFieldRow>
                    ) : null}
                </OrbitModalShell>
            </DialogContent>
        </Dialog>
    );
}

const ENV_MODAL_STYLES = `
.env-mod-id-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.env-mod-style-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
`;

function DeleteEnvelopeMenuItem({ envelopId }: { envelopId: string }) {
    const { space } = useCurrentSpace();
    const utils = trpc.useUtils();
    const del = trpc.envelop.delete.useMutation({
        onSuccess: async () => {
            toast.success("Envelope deleted");
            await utils.envelop.listBySpace.invalidate({ spaceId: space.id });
            await utils.analytics.envelopeUtilization.invalidate({ spaceId: space.id });
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <ConfirmDialog
            trigger={
                <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    className="text-destructive focus:text-destructive"
                >
                    <Trash2 className="size-3.5" /> Delete envelope
                </DropdownMenuItem>
            }
            title="Delete envelope?"
            description="You cannot delete an envelope that still has categories. Move or delete its categories first."
            confirmLabel="Delete"
            destructive
            onConfirm={() => del.mutate({ envelopId })}
        />
    );
}

function ArchiveEnvelopeMenuItem({
    envelopId,
    envelopName,
    archived,
    currentRemaining,
}: {
    envelopId: string;
    envelopName: string;
    archived: boolean;
    currentRemaining: number;
}) {
    const { space } = useCurrentSpace();
    const utils = trpc.useUtils();
    // Pre-load any active borrow obligations so the confirm dialog can
    // warn the user that archiving doesn't unwind them.
    const borrowsQuery = trpc.envelop.listBorrows.useQuery(
        { envelopId },
        { enabled: !archived }
    );
    const mutation = trpc.envelop.archive.useMutation({
        onSuccess: async () => {
            toast.success(archived ? "Unarchived" : "Archived");
            await Promise.all([
                utils.envelop.listBySpace.invalidate({ spaceId: space.id }),
                utils.analytics.envelopeUtilization.invalidate({
                    spaceId: space.id,
                }),
                utils.analytics.spaceSummary.invalidate(),
                utils.envelop.listBorrows.invalidate({ envelopId }),
            ]);
        },
        onError: (e) => toast.error(e.message),
    });

    if (archived) {
        return (
            <DropdownMenuItem
                onSelect={(e) => {
                    e.preventDefault();
                    mutation.mutate({ envelopId, archived: false });
                }}
            >
                <ArchiveRestore className="size-3.5" /> Unarchive
            </DropdownMenuItem>
        );
    }

    const allocationNote =
        currentRemaining > 0
            ? ` It currently has ${currentRemaining.toFixed(2)} allocated this period — that allocation stays put. Deallocate first if you want the cash back.`
            : "";

    const borrows = borrowsQuery.data ?? [];
    const borrowTotal = borrows.reduce((s, b) => s + b.amount, 0);
    const borrowNote =
        borrowTotal > 0
            ? ` It also has ${borrowTotal.toFixed(2)} borrowed against future periods (${borrows.length} link${borrows.length === 1 ? "" : "s"}) — those obligations stay put after archive and will keep reducing those periods' planning pool. Use "Cancel borrow" on the envelope detail page first if you want to unwind them.`
            : "";

    return (
        <ConfirmDialog
            trigger={
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Archive className="size-3.5" /> Archive…
                </DropdownMenuItem>
            }
            title={`Archive "${envelopName}"?`}
            description={`This hides ${envelopName} from the envelopes list and prevents new transactions in its categories. Existing data is preserved.${allocationNote}${borrowNote}`}
            confirmLabel="Archive"
            onConfirm={() => mutation.mutate({ envelopId, archived: true })}
        />
    );
}

void AlertTriangle; // re-exported below in case future callers rely on the file's surface

const ENV_STYLES = `
.env-root {
    margin: -1.5rem -1rem;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
}
@media (min-width: 768px) {
    .env-root { margin: -2rem; }
}

.env-topbar {
    padding: 26px 32px 18px;
    border-bottom: 1px solid var(--line-soft);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    background: var(--bg);
    flex-wrap: wrap;
}
.env-topbar-text { display: flex; flex-direction: column; gap: 6px; }
.env-title {
    font-size: 26px;
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--fg);
    margin: 0;
}
.env-sub { font-size: 13px; color: var(--fg-3); margin: 0; }
.env-topbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
@media (max-width: 720px) {
    .env-topbar { padding: 18px 18px 14px; }
}

.env-scroll {
    flex: 1;
    padding: 22px 32px 36px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}
@media (max-width: 720px) {
    .env-scroll { padding: 16px 18px 28px; }
}

/* Hero */
.env-hero-grid {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 14px;
}
@media (max-width: 1100px) {
    .env-hero-grid { grid-template-columns: 1fr; }
}

.orbit-design .od-card.env-hero {
    padding: 24px;
    position: relative;
    overflow: hidden;
}
.env-hero-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: relative;
    z-index: 1;
}
.env-hero-arrows {
    display: inline-flex;
    gap: 4px;
}
.env-hero-arrow {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    display: grid;
    place-items: center;
    background: transparent;
    border: 0;
    color: var(--fg-3);
    cursor: pointer;
    transition: background 140ms ease, color 140ms ease;
}
.env-hero-arrow:hover:not(:disabled) {
    background: var(--bg-elev-2);
    color: var(--fg);
}
.env-hero-arrow:disabled { opacity: 0.4; cursor: not-allowed; }
.env-unbudgeted {
    margin-top: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line-soft);
    position: relative;
    z-index: 1;
    flex-wrap: wrap;
}
.env-unbudgeted-cell {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}
.env-unbudgeted-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    flex-shrink: 0;
}
.env-unbudgeted-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    line-height: 1.25;
    min-width: 0;
}
.env-unbudgeted-title {
    font-size: 13px;
    color: var(--fg-2);
    font-weight: 500;
}
.env-unbudgeted-sub {
    font-size: 11px;
    color: var(--fg-4);
}
.env-unbudgeted-cta {
    font-size: 12px;
    font-weight: 500;
    color: var(--brand);
    text-decoration: none;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    transition: background 140ms ease, border-color 140ms ease;
    white-space: nowrap;
}
.env-unbudgeted-cta:hover {
    background: var(--bg-elev-3);
    border-color: var(--line-strong);
}
.env-reckoning-banner {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    background: color-mix(in oklab, var(--expense) 8%, var(--bg-elev-2));
    border: 1px solid color-mix(in oklab, var(--expense) 30%, transparent);
    text-decoration: none;
    color: inherit;
    transition: background 140ms ease;
    position: relative;
    z-index: 1;
}
.env-reckoning-banner:hover {
    background: color-mix(in oklab, var(--expense) 14%, var(--bg-elev-2));
}
.env-reckoning-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--expense);
    flex-shrink: 0;
    box-shadow: 0 0 0 4px color-mix(in oklab, var(--expense) 18%, transparent);
}
.env-reckoning-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
}
.env-reckoning-title {
    font-size: 13px;
    color: var(--fg);
    font-weight: 500;
}
.env-reckoning-sub {
    font-size: 11px;
    color: var(--fg-3);
}
.env-reckoning-cta {
    font-size: 12px;
    font-weight: 500;
    color: var(--expense);
    white-space: nowrap;
}
.env-unbudgeted-trend {
    margin-left: 10px;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in oklab, var(--expense) 12%, transparent);
    border: 1px solid color-mix(in oklab, var(--expense) 30%, transparent);
    color: var(--expense);
    font-size: 10.5px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    vertical-align: middle;
}
.env-unbudgeted-trend:hover {
    background: color-mix(in oklab, var(--expense) 18%, transparent);
}
.env-unbudgeted-breakdown {
    margin-top: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--bg);
    border: 1px solid var(--line-soft);
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    max-width: 420px;
}
.env-unbudgeted-breakdown-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--fg-3);
    font-variant-numeric: tabular-nums;
}
.env-unbudgeted-breakdown-emph {
    border-top: 1px dashed var(--line);
    padding-top: 6px;
    margin-top: 2px;
    color: var(--fg);
    font-weight: 500;
}
.env-unbudgeted-breakdown-hint {
    font-size: 10.5px;
    color: var(--fg-4);
    margin-top: 4px;
    line-height: 1.5;
}

.env-hero-stats {
    margin-top: 14px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    position: relative;
    z-index: 1;
}
@media (max-width: 720px) {
    .env-hero-stats { grid-template-columns: 1fr; }
}
.env-hero-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.env-hero-stat-sub { font-size: 11.5px; color: var(--fg-4); }
.env-hero-priority {
    margin-top: 22px;
    position: relative;
    z-index: 1;
}
.env-hero-priority-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}
.env-hero-priority-bar {
    height: 8px;
    border-radius: 99px;
    overflow: hidden;
    display: flex;
    background: var(--bg-elev-3);
}
.env-hero-priority-legend {
    display: flex;
    gap: 16px;
    margin-top: 10px;
    font-size: 11px;
    color: var(--fg-3);
    flex-wrap: wrap;
}
.env-priority-legend-cell {
    display: inline-flex;
    align-items: center;
    gap: 5px;
}
.env-priority-legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    display: inline-block;
}

/* Attention card */
.orbit-design .od-card.env-attention { padding: 20px; }
.env-sect-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 14px;
}
.env-sect-title {
    font-size: 16px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--fg);
    margin: 0;
}
.env-sect-sub { font-size: 12px; color: var(--fg-3); }
.env-attention-empty {
    padding: 20px 0;
    text-align: center;
    color: var(--fg-3);
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}
.env-attention-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.env-attention-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--bg-elev-2);
    text-decoration: none;
    color: inherit;
    transition: background 140ms ease;
}
.env-attention-row:hover { background: var(--bg-elev-3); }
.env-attention-row-name {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}
.env-attention-row-name > span:last-child {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    min-width: 0;
}
.env-attention-title {
    font-size: 13px;
    color: var(--fg);
}
.env-attention-text {
    font-size: 11px;
    color: var(--fg-4);
}

/* Toolbar */
.env-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
}
.env-search {
    position: relative;
    display: flex;
    flex: 1;
    max-width: 360px;
    align-items: center;
}
.env-search > svg {
    position: absolute;
    left: 12px;
    z-index: 1;
}
.orbit-design .od-input.env-search-input {
    flex: 1;
    width: 100%;
    padding-left: 36px;
}
.env-view-toggle {
    display: inline-flex;
    gap: 4px;
    padding: 3px;
    border-radius: 10px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line);
}
.env-view-cell {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    height: 26px;
    border-radius: 7px;
    background: transparent;
    border: 0;
    color: var(--fg-3);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: background 140ms ease, color 140ms ease;
}
.env-view-cell:hover { color: var(--fg-2); }
.env-view-cell.is-active {
    background: var(--bg-elev-3);
    color: var(--fg);
}

/* Grid */
.env-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
}
@media (max-width: 1100px) {
    .env-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 720px) {
    .env-grid { grid-template-columns: 1fr; }
}

.orbit-design .od-card.env-card {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    text-decoration: none;
    color: inherit;
    transition: border-color 140ms ease, background 140ms ease;
    position: relative;
}
.orbit-design .od-card.env-card:hover {
    border-color: var(--line-strong);
    background: var(--bg-elev-2);
}
/* Goal envelopes (cadence='none' + target_amount). Gold tint matches
   the goal accent used on Overview/section headers so the user can
   pick goal cards out of a mixed grid at a glance. */
.orbit-design .od-card.env-card.env-card-goal {
    background: color-mix(in oklab, var(--gold) 5%, var(--bg-elev-1));
    border-color: color-mix(in oklab, var(--gold) 28%, var(--line));
}
.orbit-design .od-card.env-card.env-card-goal:hover {
    background: color-mix(in oklab, var(--gold) 12%, var(--bg-elev-2));
    border-color: color-mix(in oklab, var(--gold) 40%, var(--line));
}
.env-card-goal .env-card-cadence > span:first-child {
    color: var(--gold);
    font-weight: 500;
}
/* Archive wins over goal: an archived goal should read as muted, not
   as a gold-accent active card. Reset background and border at higher
   specificity. */
.orbit-design .od-card.env-card.env-card-goal.env-card-archived {
    background: var(--bg-elev-1);
    border-color: var(--line);
}
.orbit-design .od-card.env-card.env-card-goal.env-card-archived:hover {
    background: var(--bg-elev-2);
    border-color: var(--line-strong);
}
.env-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}
.env-card-name {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}
.env-card-text {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
    min-width: 0;
}
.env-card-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.env-card-cadence {
    font-size: 11px;
    color: var(--fg-4);
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 4px;
    row-gap: 2px;
}
.env-card-amt-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
}
.env-card-of {
    font-size: 11px;
    color: var(--fg-4);
}
.env-card-foot {
    display: flex;
    justify-content: space-between;
    font-size: 11.5px;
}
.env-card-menu {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: transparent;
    border: 0;
    color: var(--fg-4);
    cursor: pointer;
    flex-shrink: 0;
}
.env-card-menu:hover {
    background: var(--bg-elev-2);
    color: var(--fg);
}

/* List rows */
.orbit-design .od-card.env-list { padding: 0; overflow: hidden; }
.env-list-row {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.2fr) auto auto;
    align-items: center;
    gap: 16px;
    padding: 14px 18px;
    text-decoration: none;
    color: inherit;
    transition: background 140ms ease;
}
.env-list-row:hover { background: var(--bg-elev-2); }
.env-list-row-name {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}
.env-list-row-text {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    min-width: 0;
}
.env-list-row-title {
    font-size: 13px;
    color: var(--fg);
    font-weight: 500;
}
.env-list-row-cadence {
    font-size: 11px;
    color: var(--fg-4);
}
.env-list-row-bar {
    min-width: 80px;
}
.env-list-row-amt {
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-align: right;
}
/* Goal rows: gold eyebrow signal so the "Goal" word is visible at a
   glance, matching the grid card affordance. */
.env-list-row-goal .env-list-row-cadence > :first-child {
    color: var(--gold);
    font-weight: 500;
}
@media (max-width: 720px) {
    .env-list-row { grid-template-columns: 1fr auto; gap: 12px; }
    .env-list-row-bar { display: none; }
    /* Goal rows keep their progress bar even on mobile — it's the only
       signal of completion left once the row is this compact. Bar moves
       beneath the title row in its own grid track. */
    .env-list-row-goal { grid-template-columns: 1fr auto; }
    .env-list-row-goal .env-list-row-bar {
        display: block;
        grid-column: 1 / -1;
        margin-top: 4px;
    }
}

/* Groups */
.env-groups {
    display: flex;
    flex-direction: column;
    gap: 18px;
}
.env-group { display: flex; flex-direction: column; gap: 8px; }
.env-group-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 0 4px;
}
.env-group-count { font-size: 11px; color: var(--fg-4); }

/* Empty */
.orbit-design .od-card.env-empty {
    padding: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    text-align: center;
}

/* Sort popover */
.env-popover-item {
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
.env-popover-item:hover { background: var(--bg-elev-2); color: var(--fg); }
/* Sort items with a goal-only hint stack label + 11px muted subhead. */
.env-sort-item { align-items: flex-start; }
.env-sort-item-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
}
.env-sort-item-sub {
    font-size: 11px;
    color: var(--fg-4);
    font-weight: 400;
}

/* Archived envelopes — collapsible reveal section + dimmed cards. */
.env-archived-section {
    margin-top: 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-top: 18px;
    border-top: 1px dashed var(--line-soft);
}
.env-archived-toggle {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 0;
    color: var(--fg-3);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    padding: 4px 6px;
    border-radius: 6px;
    transition: color 140ms ease, background 140ms ease;
}
.env-archived-toggle:hover {
    color: var(--fg);
    background: var(--bg-elev-2);
}
.env-archived-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 18px;
    min-width: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--bg-elev-3);
    font-size: 10.5px;
    font-weight: 600;
    color: var(--fg-3);
    font-variant-numeric: tabular-nums;
}
.env-archived-grid .env-card {
    opacity: 0.7;
}
.env-archived-grid .env-card:hover {
    opacity: 1;
}
.env-card-archived {
    background: var(--bg-elev-1);
}
.env-archived-pill {
    display: inline-flex;
    align-items: center;
    height: 16px;
    padding: 0 6px;
    margin-left: 6px;
    border-radius: 999px;
    background: var(--bg-elev-3);
    color: var(--fg-3);
    font-size: 9.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    vertical-align: middle;
}

/* Phone (<640px) — tighter spacing on the envelope page. */
@media (max-width: 640px) {
    .env-topbar { padding: 14px 14px 10px; }
    .env-title { font-size: 22px; }
    .env-scroll { padding: 12px 14px 22px; gap: 12px; }
    .env-grid { grid-template-columns: 1fr; }
    .env-empty { padding: 24px; }
    .orbit-design .od-card.env-hero { padding: 16px; }
    .env-unbudgeted {
        padding: 10px 12px;
        gap: 10px;
    }
    .env-unbudgeted-cta {
        padding: 8px 12px;
        min-height: 36px;
        display: inline-flex;
        align-items: center;
    }
    .env-reckoning-banner { padding: 10px 12px; gap: 10px; }
    .env-hero-stats { gap: 14px; margin-top: 12px; }
    .env-hero-priority { margin-top: 16px; }
    .orbit-design .od-card.env-card { padding: 14px; gap: 12px; }
    .env-card-menu {
        width: 32px;
        height: 32px;
    }
    .env-list-row { padding: 12px 14px; gap: 10px; }
    .env-archived-section { margin-top: 16px; padding-top: 14px; }
}
`;
