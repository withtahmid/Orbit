import { useMemo, useState, type ReactNode } from "react";
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
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ROUTES } from "@/router/routes";
import { DEFAULT_COLOR } from "@/lib/entityStyle";
import { addMonths, startOfMonth, endOfMonth } from "@/lib/dates";
import type { RouterOutput } from "@/trpc";

type Cadence = "none" | "monthly";
type EnvelopeRow = RouterOutput["analytics"]["envelopeUtilization"][number];
type ViewMode = "grouped" | "list" | "grid";
type SortMode = "cadence" | "urgency" | "remaining" | "spent" | "name";

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
    { value: "cadence", label: "Cadence" },
    { value: "urgency", label: "Urgency" },
    { value: "spent", label: "Spent" },
    { value: "remaining", label: "Remaining" },
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
                pctOf(b.consumed, b.allocated) - pctOf(a.consumed, a.allocated)
        );
    else
        arr.sort((a, b) => {
            if (a.cadence === b.cadence) return a.name.localeCompare(b.name);
            return a.cadence === "monthly" ? -1 : 1;
        });
    return arr;
}

function groupByCadence(list: EnvelopeRow[]): Record<Cadence, EnvelopeRow[]> {
    const out: Record<Cadence, EnvelopeRow[]> = { none: [], monthly: [] };
    for (const e of list)
        (out[e.cadence as Cadence] ??= []).push(e);
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
            continue;
        }
        const drift = e.breakdown.filter(
            (b) => b.isDrift && b.remaining < 0
        ).length;
        if (drift > 0) {
            items.push({
                envelopId: e.envelopId,
                name: e.name,
                color: e.color,
                icon: e.icon,
                text: `${drift} account${drift === 1 ? "" : "s"} drifted`,
            });
        }
    }
    return items;
}

export default function EnvelopesPage() {
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

    const envelopes = useMemo(
        () => utilizationQuery.data ?? [],
        [utilizationQuery.data]
    );

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
    const grouped = useMemo(() => groupByCadence(sorted), [sorted]);

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
                    <h1 className="display env-title">Envelopes</h1>
                    <p className="env-sub">
                        Logical buckets that hold the budget for each category.
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
                                        to={ROUTES.spaceEnvelopeDetail(
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
                            No envelopes yet
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--fg-4)" }}>
                            Create an envelope to start budgeting.
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
                        {(["monthly", "none"] as Cadence[]).map((c) => {
                            const items = grouped[c];
                            if (!items || items.length === 0) return null;
                            return (
                                <div key={c} className="env-group">
                                    <div className="env-group-head">
                                        <span className="eyebrow">
                                            {c === "monthly"
                                                ? "Monthly · resets on the 1st"
                                                : "Rolling · accumulates"}
                                        </span>
                                        <span className="env-group-count">
                                            {items.length} envelope
                                            {items.length === 1 ? "" : "s"}
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
    const total = env.allocated + env.carryIn;
    const v = total > 0 ? env.consumed / total : env.consumed > 0 ? Infinity : 0;
    const drift = v > 1;
    const remaining = total - env.consumed;
    const overBy = env.consumed - total;

    return (
        <Link
            to={ROUTES.spaceEnvelopeDetail(spaceId, env.envelopId)}
            className="od-card env-card"
        >
            <div className="env-card-head">
                <span className="env-card-name">
                    <EntityAvatar icon={env.icon} colorVar={env.color} size={32} />
                    <span className="env-card-text">
                        <span className="env-card-title">{env.name}</span>
                        <span className="env-card-cadence">
                            {env.cadence === "monthly" ? "Monthly" : "Rolling"}
                            {drift && (
                                <>
                                    {" "}
                                    ·{" "}
                                    <span style={{ color: "var(--expense)" }}>
                                        drift
                                    </span>
                                </>
                            )}
                        </span>
                    </span>
                </span>
                <EnvelopeMenu env={env} />
            </div>
            <div className="env-card-amt-row">
                <Money amount={env.consumed} size={26} />
                <span className="env-card-of">
                    of <Money amount={total} variant="muted" size={11} />
                </span>
            </div>
            <ProgressBar value={v} color={env.color} height={5} />
            <div className="env-card-foot">
                <span
                    style={{
                        color: drift ? "var(--expense)" : "var(--fg-3)",
                    }}
                >
                    {drift
                        ? `${Math.round(v * 100)}% over`
                        : `${Math.round(v * 100)}%`}
                </span>
                <span style={{ color: "var(--fg-4)" }}>
                    {drift ? (
                        <>
                            over{" "}
                            <Money
                                amount={Math.abs(overBy)}
                                size={11}
                                variant="expense"
                            />
                        </>
                    ) : (
                        <>
                            Left{" "}
                            <Money
                                amount={Math.max(0, remaining)}
                                size={11}
                            />
                        </>
                    )}
                </span>
            </div>
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
    const total = env.allocated + env.carryIn;
    const v = total > 0 ? env.consumed / total : env.consumed > 0 ? Infinity : 0;
    const drift = v > 1;
    return (
        <Link
            to={ROUTES.spaceEnvelopeDetail(spaceId, env.envelopId)}
            className="env-list-row"
            style={{
                borderBottom: last ? "none" : "1px solid var(--line-soft)",
            }}
        >
            <div className="env-list-row-name">
                <EntityAvatar icon={env.icon} colorVar={env.color} size={26} />
                <div className="env-list-row-text">
                    <div className="env-list-row-title">{env.name}</div>
                    <div className="env-list-row-cadence">
                        {env.cadence === "monthly" ? "Monthly" : "Rolling"}
                        {drift && (
                            <>
                                {" "}
                                ·{" "}
                                <span style={{ color: "var(--expense)" }}>drift</span>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <div className="env-list-row-bar">
                <ProgressBar value={v} color={env.color} height={4} />
            </div>
            <div className="env-list-row-amt">
                <Money
                    amount={env.consumed}
                    size={12.5}
                    variant={drift ? "expense" : "neutral"}
                />{" "}
                <span style={{ color: "var(--fg-4)" }}>
                    /{" "}
                    <Money
                        amount={total}
                        size={12.5}
                        variant="muted"
                    />
                </span>
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
    return (
        <span
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
        >
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
                <DropdownMenuContent align="end" className="w-44">
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
                    </PermissionGate>
                    <PermissionGate roles={["owner"]}>
                        <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                            <Pencil className="size-3.5" /> Edit envelope
                        </DropdownMenuItem>
                        <DeleteEnvelopeMenuItem envelopId={env.envelopId} />
                    </PermissionGate>
                </DropdownMenuContent>
            </DropdownMenu>
            <CreateOrEditEnvelopeDialog
                envelope={env}
                open={editOpen}
                onOpenChange={setEditOpen}
                hideDefaultTrigger
            />
        </span>
    );
}

/* ============================================================
   Helpers
   ============================================================ */

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
                className="orbit-design env-popover w-44 p-1"
            >
                {SORT_OPTIONS.map((o) => (
                    <button
                        key={o.value}
                        type="button"
                        className="env-popover-item"
                        onClick={() => setSort(o.value)}
                    >
                        {o.label}
                        {sort === o.value && (
                            <Check
                                className="ml-auto size-3.5"
                                style={{ color: "var(--brand)" }}
                            />
                        )}
                    </button>
                ))}
            </PopoverContent>
        </Popover>
    );
}

/* ============================================================
   Dialogs (preserved)
   ============================================================ */

interface EditableEnvelope {
    envelopId: string;
    name: string;
    color: string;
    icon: string;
    description: string | null;
    cadence: Cadence;
    carryOver: boolean;
}

function CreateOrEditEnvelopeDialog({
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
    const [carryOver, setCarryOver] = useState<boolean>(
        envelope?.carryOver ?? false
    );

    const invalidate = async () => {
        await utils.envelop.listBySpace.invalidate({ spaceId: space.id });
        await utils.analytics.envelopeUtilization.invalidate({ spaceId: space.id });
    };

    const create = trpc.envelop.create.useMutation({
        onSuccess: async () => {
            toast.success("Envelope created");
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
        if (!name.trim()) return;
        if (editing) {
            update.mutate({
                envelopId: envelope!.envelopId,
                name: name.trim(),
                color,
                icon,
                description: description.trim() || null,
                cadence,
                carryOver,
            });
        } else {
            create.mutate({
                spaceId: space.id,
                name: name.trim(),
                color,
                icon,
                description: description.trim() || undefined,
                cadence,
                carryOver,
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
                    eyebrow="Envelopes"
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
                                label="Rollover"
                                hint={carryOver ? "Carries forward" : "Resets monthly"}
                            >
                                <OrbitRadioRow
                                    name="env-rollover"
                                    value={carryOver ? "carry" : "reset"}
                                    onChange={(v) => setCarryOver(v === "carry")}
                                    options={[
                                        {
                                            value: "carry",
                                            label: "Carry",
                                            hint: "Unspent rolls",
                                        },
                                        {
                                            value: "reset",
                                            label: "Reset",
                                            hint: "Returns to pool",
                                        },
                                    ]}
                                />
                            </OrbitField>
                        ) : (
                            <div />
                        )}
                    </OrbitFieldRow>
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
@media (max-width: 720px) {
    .env-list-row { grid-template-columns: 1fr auto; gap: 12px; }
    .env-list-row-bar { display: none; }
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
`;
