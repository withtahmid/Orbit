import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    AlertTriangle,
    ArrowDownToLine,
    ArrowUpDown,
    ArrowUpFromLine,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    LayoutGrid,
    List,
    ListTree,
    Mail,
    MoreHorizontal,
    Pencil,
    Plus,
    Search,
    Split,
    Trash2,
    TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { EntityStyleFields } from "@/components/shared/EntityStyleFields";
import { EnvelopeAllocateDialog } from "@/features/allocations/EnvelopeAllocateDialog";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ROUTES } from "@/router/routes";
import { DEFAULT_COLOR } from "@/lib/entityStyle";
import { formatMoney } from "@/lib/money";
import { addMonths, startOfMonth, endOfMonth } from "@/lib/dates";
import { cn } from "@/lib/utils";

import type { RouterOutput } from "@/trpc";

type Cadence = "none" | "monthly";
type EnvelopeRow = RouterOutput["analytics"]["envelopeUtilization"][number];
type ViewMode = "grouped" | "flat" | "grid";
type SortMode = "cadence" | "urgency" | "remaining" | "spent" | "name";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function pctOf(consumed: number, allocated: number): number {
    if (allocated > 0) return (consumed / allocated) * 100;
    if (consumed > 0) return Infinity;
    return 0;
}

type Level = "ok" | "warn" | "danger" | "over";

function levelOf(pct: number): Level {
    if (!Number.isFinite(pct)) return "over";
    if (pct > 100) return "over";
    if (pct > 90) return "danger";
    if (pct > 70) return "warn";
    return "ok";
}

function levelColor(level: Level, fallback: string): string {
    if (level === "over") return "var(--destructive)";
    if (level === "danger") return "var(--expense)";
    if (level === "warn") return "var(--warning)";
    return fallback;
}

function formatMonthLabel(d: Date): string {
    return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function daysLeftInMonth(now: Date, monthStart: Date, monthEnd: Date): number {
    if (now < monthStart) return Math.ceil((monthEnd.getTime() - monthStart.getTime()) / 86_400_000);
    if (now >= monthEnd) return 0;
    return Math.max(0, Math.ceil((monthEnd.getTime() - now.getTime()) / 86_400_000));
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function EnvelopesPage() {
    const { space } = useCurrentSpace();
    const [monthOffset, setMonthOffset] = useState(0);
    const [query, setQuery] = useState("");
    const [view, setView] = useState<ViewMode>("grouped");
    const [sort, setSort] = useState<SortMode>("cadence");
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const debouncedQuery = useDebouncedValue(query, 200);

    const now = useMemo(() => new Date(), []);
    const viewingDate = useMemo(() => addMonths(now, monthOffset), [now, monthOffset]);
    const periodStart = useMemo(() => startOfMonth(viewingDate), [viewingDate]);
    const periodEnd = useMemo(() => endOfMonth(viewingDate), [viewingDate]);
    const monthLabel = formatMonthLabel(viewingDate);
    const daysLeft =
        monthOffset === 0 ? daysLeftInMonth(now, periodStart, periodEnd) : null;

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

    const isEmpty =
        !utilizationQuery.isLoading && (utilizationQuery.data?.length ?? 0) === 0;

    return (
        <div className="grid gap-6">
            <PageHeader
                title="Envelopes"
                description="Every unit of money committed to a purpose. Monthly envelopes reset on the 1st; rolling envelopes accumulate."
                actions={
                    <PermissionGate roles={["owner"]}>
                        <CreateOrEditEnvelopeDialog />
                    </PermissionGate>
                }
            />

            {utilizationQuery.isLoading ? (
                <Skeleton className="h-[260px] rounded-2xl" />
            ) : isEmpty ? (
                <EmptyState
                    icon={Mail}
                    title="No envelopes yet"
                    description="Create an envelope to start budgeting."
                    action={
                        <PermissionGate roles={["owner"]}>
                            <CreateOrEditEnvelopeDialog />
                        </PermissionGate>
                    }
                />
            ) : (
                <>
                    <MonthHero
                        envelopes={envelopes}
                        priorityBreakdown={priorityQuery.data ?? []}
                        monthLabel={monthLabel}
                        daysLeft={daysLeft}
                        onPrev={() => setMonthOffset((m) => m - 1)}
                        onNext={() => setMonthOffset((m) => m + 1)}
                        canGoForward={monthOffset < 0}
                    />

                    <div className="flex flex-col gap-3">
                        <Toolbar
                            query={query}
                            setQuery={setQuery}
                            view={view}
                            setView={setView}
                            sort={sort}
                            setSort={setSort}
                            count={sorted.length}
                        />

                        {sorted.length === 0 ? (
                            <div className="rounded-xl border border-border bg-card/50 py-12 text-center text-sm text-muted-foreground">
                                No envelopes match “{debouncedQuery}”.
                            </div>
                        ) : view === "grid" ? (
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {sorted.map((e) => (
                                    <EnvelopeCard key={e.envelopId} env={e} />
                                ))}
                            </div>
                        ) : view === "flat" ? (
                            <div className="flex flex-col gap-1.5">
                                {sorted.map((e) => (
                                    <EnvelopeRow key={e.envelopId} env={e} />
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-5">
                                {(["monthly", "none"] as Cadence[]).map((c) => {
                                    const items = grouped[c];
                                    if (!items || items.length === 0) return null;
                                    const isCollapsed = !!collapsed[c];
                                    return (
                                        <div key={c} className="flex flex-col gap-1.5">
                                            <GroupHeader
                                                cadence={c}
                                                envelopes={items}
                                                collapsed={isCollapsed}
                                                onToggle={() =>
                                                    setCollapsed((s) => ({
                                                        ...s,
                                                        [c]: !s[c],
                                                    }))
                                                }
                                            />
                                            {!isCollapsed &&
                                                items.map((e) => (
                                                    <EnvelopeRow
                                                        key={e.envelopId}
                                                        env={e}
                                                    />
                                                ))}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// MonthHero
// ─────────────────────────────────────────────────────────────

type PriorityRow = RouterOutput["analytics"]["priorityBreakdown"][number];

function MonthHero({
    envelopes,
    priorityBreakdown,
    monthLabel,
    daysLeft,
    onPrev,
    onNext,
    canGoForward,
}: {
    envelopes: EnvelopeRow[];
    priorityBreakdown: PriorityRow[];
    monthLabel: string;
    daysLeft: number | null;
    onPrev: () => void;
    onNext: () => void;
    canGoForward: boolean;
}) {
    const totals = useMemo(() => {
        const allocated = envelopes.reduce((s, e) => s + e.allocated + e.carryIn, 0);
        const consumed = envelopes.reduce((s, e) => s + e.consumed, 0);
        const remaining = envelopes.reduce((s, e) => s + e.remaining, 0);
        const over = envelopes.filter((e) => e.consumed > e.allocated + e.carryIn && e.allocated + e.carryIn > 0);
        const overAmount = over.reduce(
            (s, e) => s + (e.consumed - e.allocated - e.carryIn),
            0
        );
        return { allocated, consumed, remaining, over, overAmount };
    }, [envelopes]);

    const prioritySpend = priorityBreakdown.filter((p) => p.total > 0);
    const prioritySum = prioritySpend.reduce((s, p) => s + Number(p.total), 0);
    const pct = totals.allocated > 0 ? (totals.consumed / totals.allocated) * 100 : 0;

    return (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="grid gap-0 md:grid-cols-[1.2fr_1fr]">
                <div className="border-b border-border p-6 md:border-b-0 md:border-r md:p-7">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                {monthLabel}
                            </span>
                            {daysLeft !== null && daysLeft > 0 && (
                                <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={onPrev}
                                className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                                aria-label="Previous month"
                            >
                                <ChevronLeft className="size-3.5" />
                            </button>
                            <button
                                onClick={onNext}
                                disabled={!canGoForward}
                                className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label="Next month"
                            >
                                <ChevronRight className="size-3.5" />
                            </button>
                        </div>
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-6">
                        <Stat
                            label="Allocated"
                            value={totals.allocated}
                            sub={`across ${envelopes.length} envelope${envelopes.length === 1 ? "" : "s"}`}
                            tone="neutral"
                        />
                        <Stat
                            label="Spent"
                            value={totals.consumed}
                            sub={`${pct.toFixed(0)}% of allocated`}
                            tone="neutral"
                            accent
                        />
                        <Stat
                            label="Remaining"
                            value={totals.remaining}
                            sub={
                                totals.overAmount > 0
                                    ? `$${formatMoney(totals.overAmount)} over`
                                    : "on track"
                            }
                            tone={totals.overAmount > 0 ? "expense" : "income"}
                        />
                    </div>

                    {prioritySum > 0 && (
                        <div className="mt-6">
                            <div className="mb-2 flex items-center justify-between text-[11px]">
                                <span className="font-medium uppercase tracking-wider text-muted-foreground">
                                    Spent by priority
                                </span>
                                <span className="font-mono tabular-nums text-muted-foreground">
                                    ${formatMoney(prioritySum)}
                                </span>
                            </div>
                            <div className="relative flex h-2.5 overflow-hidden rounded-full bg-secondary">
                                {prioritySpend.map((p) => {
                                    const width = (Number(p.total) / prioritySum) * 100;
                                    return (
                                        <div
                                            key={p.priority}
                                            className="h-full first:rounded-l-full last:rounded-r-full"
                                            style={{
                                                width: `${width}%`,
                                                background: p.color,
                                            }}
                                            title={`${p.label}: $${formatMoney(Number(p.total))}`}
                                        />
                                    );
                                })}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                                {prioritySpend.map((p) => (
                                    <div
                                        key={p.priority}
                                        className="flex items-center gap-1.5 text-muted-foreground"
                                    >
                                        <span
                                            className="inline-block size-2 rounded-full"
                                            style={{ background: p.color }}
                                        />
                                        <span>{p.label}</span>
                                        <span className="font-mono tabular-nums text-foreground/80">
                                            ${formatMoney(Number(p.total))}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <AttentionPanel envelopes={envelopes} />
            </div>
        </div>
    );
}

function Stat({
    label,
    value,
    sub,
    tone = "neutral",
    accent = false,
}: {
    label: string;
    value: number;
    sub: string;
    tone?: "neutral" | "income" | "expense";
    accent?: boolean;
}) {
    const toneCls =
        tone === "expense"
            ? "text-[color:var(--expense)]"
            : tone === "income"
              ? "text-[color:var(--income)]"
              : "text-foreground";
    return (
        <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {label}
            </div>
            <div
                className={cn(
                    "mt-1 truncate font-mono text-[28px] font-semibold leading-none tabular-nums md:text-3xl",
                    accent
                        ? "bg-gradient-to-br from-primary to-brand-gradient-to bg-clip-text text-transparent"
                        : toneCls
                )}
            >
                ${formatMoney(Math.abs(value))}
            </div>
            <div className="mt-1.5 truncate text-xs text-muted-foreground">{sub}</div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// AttentionPanel
// ─────────────────────────────────────────────────────────────

type AttentionKind = "over" | "drift" | "unallocated";

interface AttentionItem {
    kind: AttentionKind;
    env: EnvelopeRow;
    detail: string;
}

function buildAttention(envelopes: EnvelopeRow[]): AttentionItem[] {
    const out: AttentionItem[] = [];
    for (const e of envelopes) {
        const pool = e.allocated + e.carryIn;
        if (e.consumed > pool && pool > 0) {
            out.push({
                kind: "over",
                env: e,
                detail: `over by $${formatMoney(e.consumed - pool)}`,
            });
        } else if (e.consumed > 0 && pool === 0) {
            out.push({
                kind: "unallocated",
                env: e,
                detail: `$${formatMoney(e.consumed)} spent with no allocation`,
            });
        } else {
            const drifted = e.breakdown.filter((b) => b.isDrift).length;
            if (drifted > 0) {
                out.push({
                    kind: "drift",
                    env: e,
                    detail: `${drifted} account${drifted === 1 ? "" : "s"} drifted`,
                });
            }
        }
    }
    const rank: Record<AttentionKind, number> = { over: 0, drift: 1, unallocated: 2 };
    out.sort((a, b) => rank[a.kind] - rank[b.kind]);
    return out;
}

function AttentionPanel({ envelopes }: { envelopes: EnvelopeRow[] }) {
    const items = useMemo(() => buildAttention(envelopes).slice(0, 5), [envelopes]);
    return (
        <div className="flex min-h-[220px] flex-col p-6 md:p-7">
            <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <AlertTriangle className="size-3.5" />
                    Needs attention
                </span>
                {items.length > 0 && (
                    <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                        {items.length}
                    </span>
                )}
            </div>
            {items.length === 0 ? (
                <div className="grid flex-1 place-items-center py-6 text-center">
                    <div>
                        <div className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-[color:var(--income)]/15 text-[color:var(--income)]">
                            <Check className="size-[18px]" />
                        </div>
                        <p className="text-sm font-medium">All envelopes on track</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Nothing over or drifted this period.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="flex flex-1 flex-col gap-1.5">
                    {items.map((it, i) => (
                        <AttentionRow key={i} item={it} />
                    ))}
                </div>
            )}
        </div>
    );
}

function AttentionRow({ item }: { item: AttentionItem }) {
    const { space } = useCurrentSpace();
    const cfg =
        item.kind === "over"
            ? { Icon: TrendingUp, color: "var(--expense)" }
            : item.kind === "drift"
              ? { Icon: Split, color: "var(--warning)" }
              : { Icon: CircleAlert, color: "var(--warning)" };
    const Icon = cfg.Icon;
    return (
        <Link
            to={ROUTES.spaceEnvelopeDetail(space.id, item.env.envelopId)}
            className="-mx-2 flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary/60"
        >
            <span
                className="grid size-7 shrink-0 place-items-center rounded-md"
                style={{
                    background: `color-mix(in oklab, ${cfg.color} 15%, transparent)`,
                    color: cfg.color,
                }}
            >
                <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{item.env.name}</div>
                <div className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">
                    {item.detail}
                </div>
            </div>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        </Link>
    );
}

// ─────────────────────────────────────────────────────────────
// Toolbar
// ─────────────────────────────────────────────────────────────

function Toolbar({
    query,
    setQuery,
    view,
    setView,
    sort,
    setSort,
    count,
}: {
    query: string;
    setQuery: (v: string) => void;
    view: ViewMode;
    setView: (v: ViewMode) => void;
    sort: SortMode;
    setSort: (v: SortMode) => void;
    count: number;
}) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search envelopes…"
                    className="h-9 pl-9"
                />
            </div>
            <SegmentedControl
                value={view}
                onChange={setView}
                options={[
                    { value: "grouped", label: "Grouped", Icon: ListTree },
                    { value: "flat", label: "List", Icon: List },
                    { value: "grid", label: "Grid", Icon: LayoutGrid },
                ]}
            />
            <SortMenu sort={sort} setSort={setSort} />
            <div className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                {count} envelope{count === 1 ? "" : "s"}
            </div>
        </div>
    );
}

function SegmentedControl<T extends string>({
    value,
    onChange,
    options,
}: {
    value: T;
    onChange: (v: T) => void;
    options: { value: T; label: string; Icon: React.ComponentType<{ className?: string }> }[];
}) {
    return (
        <div className="inline-flex h-9 rounded-md border border-border bg-secondary/30 p-0.5">
            {options.map((o) => {
                const active = value === o.value;
                const Icon = o.Icon;
                return (
                    <button
                        key={o.value}
                        onClick={() => onChange(o.value)}
                        className={cn(
                            "flex h-full items-center gap-1.5 rounded-[5px] px-2.5 text-sm transition-colors",
                            active
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Icon className="size-3.5" />
                        <span className="hidden md:inline">{o.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

const SORTS: { value: SortMode; label: string }[] = [
    { value: "cadence", label: "Cadence (monthly first)" },
    { value: "urgency", label: "Urgency (most over first)" },
    { value: "remaining", label: "Least remaining" },
    { value: "spent", label: "Most spent" },
    { value: "name", label: "Name (A–Z)" },
];

function SortMenu({
    sort,
    setSort,
}: {
    sort: SortMode;
    setSort: (v: SortMode) => void;
}) {
    const current = SORTS.find((s) => s.value === sort);
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                    <ArrowUpDown className="size-3.5" />
                    <span className="hidden sm:inline">Sort: {current?.label}</span>
                    <span className="sm:hidden">Sort</span>
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
                {SORTS.map((s) => (
                    <DropdownMenuItem
                        key={s.value}
                        onClick={() => setSort(s.value)}
                        className="flex items-center justify-between"
                    >
                        <span
                            className={
                                sort === s.value
                                    ? "text-foreground"
                                    : "text-muted-foreground"
                            }
                        >
                            {s.label}
                        </span>
                        {sort === s.value && <Check className="size-3.5" />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

// ─────────────────────────────────────────────────────────────
// Grouping / sorting helpers
// ─────────────────────────────────────────────────────────────

function sortEnvelopes(list: EnvelopeRow[], mode: SortMode): EnvelopeRow[] {
    const next = list.slice();
    if (mode === "urgency") {
        next.sort((a, b) => {
            const aOver = a.consumed - (a.allocated + a.carryIn);
            const bOver = b.consumed - (b.allocated + b.carryIn);
            if (aOver !== bOver) return bOver - aOver;
            return (
                pctOf(b.consumed, b.allocated + b.carryIn) -
                pctOf(a.consumed, a.allocated + a.carryIn)
            );
        });
    } else if (mode === "remaining") {
        next.sort((a, b) => a.remaining - b.remaining);
    } else if (mode === "spent") {
        next.sort((a, b) => b.consumed - a.consumed);
    } else if (mode === "name") {
        next.sort((a, b) => a.name.localeCompare(b.name));
    } else {
        // cadence default — monthly before rolling, then by consumed desc
        next.sort((a, b) => {
            const ra = a.cadence === "monthly" ? 0 : 1;
            const rb = b.cadence === "monthly" ? 0 : 1;
            if (ra !== rb) return ra - rb;
            return b.consumed - a.consumed;
        });
    }
    return next;
}

function groupByCadence(list: EnvelopeRow[]): Record<Cadence, EnvelopeRow[]> {
    const out: Record<Cadence, EnvelopeRow[]> = { monthly: [], none: [] };
    for (const e of list) out[e.cadence].push(e);
    return out;
}

function GroupHeader({
    cadence,
    envelopes,
    collapsed,
    onToggle,
}: {
    cadence: Cadence;
    envelopes: EnvelopeRow[];
    collapsed: boolean;
    onToggle: () => void;
}) {
    const meta =
        cadence === "monthly"
            ? {
                  label: "Monthly",
                  description: "Reset each month",
                  dot: "var(--primary)",
              }
            : {
                  label: "Rolling",
                  description: "Accumulate over time",
                  dot: "var(--transfer)",
              };
    const allocated = envelopes.reduce((s, e) => s + e.allocated + e.carryIn, 0);
    const consumed = envelopes.reduce((s, e) => s + e.consumed, 0);
    const pct = allocated > 0 ? (consumed / allocated) * 100 : 0;

    return (
        <button
            onClick={onToggle}
            className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-secondary/30"
        >
            <span
                className="text-muted-foreground transition-transform group-hover:text-foreground"
                style={{ transform: collapsed ? "rotate(0deg)" : "rotate(90deg)" }}
            >
                <ChevronRight className="size-3.5" />
            </span>
            <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ background: meta.dot }}
            />
            <div className="flex min-w-0 items-baseline gap-2">
                <span className="text-sm font-semibold">{meta.label}</span>
                <span className="hidden text-[11px] text-muted-foreground sm:inline">
                    {meta.description}
                </span>
            </div>
            <span className="ml-auto flex items-center gap-4 font-mono text-[11px] tabular-nums text-muted-foreground">
                <span>
                    {envelopes.length} envelope{envelopes.length === 1 ? "" : "s"}
                </span>
                <span className="hidden sm:inline">
                    ${formatMoney(consumed)} / ${formatMoney(allocated)}
                    <span className="ml-1.5 text-muted-foreground/70">
                        {pct.toFixed(0)}%
                    </span>
                </span>
            </span>
        </button>
    );
}

// ─────────────────────────────────────────────────────────────
// EnvelopeRow (compact, expandable)
// ─────────────────────────────────────────────────────────────

function EnvelopeRow({ env }: { env: EnvelopeRow }) {
    const [open, setOpen] = useState(false);
    const { space } = useCurrentSpace();
    const pool = env.allocated + env.carryIn;
    const pct = pctOf(env.consumed, pool);
    const level = levelOf(pct);
    const capPct = Math.min(100, Number.isFinite(pct) ? pct : 100);
    const barColor = levelColor(level, env.color);
    const driftCount = env.breakdown.filter((b) => b.isDrift).length;

    return (
        <div className="group rounded-xl border border-border bg-card/50 transition-colors hover:bg-card">
            <div
                className="grid cursor-pointer select-none items-center gap-3 px-3 py-2.5"
                style={{
                    gridTemplateColumns:
                        "auto minmax(0, 1.4fr) minmax(0, 2fr) auto auto",
                }}
                onClick={() => setOpen((o) => !o)}
            >
                <Link
                    to={ROUTES.spaceEnvelopeDetail(space.id, env.envelopId)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex shrink-0"
                    aria-label={`Open ${env.name}`}
                >
                    <EntityAvatar color={env.color} icon={env.icon} size="md" />
                </Link>

                <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                        <Link
                            to={ROUTES.spaceEnvelopeDetail(space.id, env.envelopId)}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate font-medium hover:underline"
                        >
                            {env.name}
                        </Link>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{env.cadence === "monthly" ? "Monthly" : "Rolling"}</span>
                        {env.carryOver && env.cadence === "monthly" && (
                            <>
                                <span className="text-border">·</span>
                                <span>carries over</span>
                            </>
                        )}
                        {env.carryIn > 0 && (
                            <>
                                <span className="text-border">·</span>
                                <span className="font-mono tabular-nums">
                                    ${formatMoney(env.carryIn)} rolled in
                                </span>
                            </>
                        )}
                        {driftCount > 0 && (
                            <>
                                <span className="text-border">·</span>
                                <span className="flex items-center gap-1 text-destructive">
                                    <AlertTriangle className="size-2.5" />
                                    drift
                                </span>
                            </>
                        )}
                    </div>
                </div>

                <div className="min-w-0">
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <div className="font-mono text-sm tabular-nums">
                            <span
                                className={cn(
                                    "font-semibold",
                                    level === "over" && "text-destructive"
                                )}
                            >
                                ${formatMoney(env.consumed)}
                            </span>
                            <span className="text-muted-foreground">
                                {" "}
                                / ${formatMoney(pool)}
                            </span>
                        </div>
                        <div
                            className={cn(
                                "font-mono text-[11px] tabular-nums",
                                level === "over"
                                    ? "font-semibold text-destructive"
                                    : "text-muted-foreground"
                            )}
                        >
                            {Number.isFinite(pct) ? `${pct.toFixed(0)}%` : "—"}
                            {level === "over" && Number.isFinite(pct) && " over"}
                        </div>
                    </div>
                    <div className="relative h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                            className="absolute inset-y-0 left-0 transition-all"
                            style={{
                                width: `${capPct}%`,
                                background: barColor,
                            }}
                        />
                        {level === "over" && (
                            <div className="absolute inset-y-0 right-0 w-0.5 bg-destructive-foreground/40" />
                        )}
                    </div>
                </div>

                <div className="shrink-0 text-right">
                    <div className="mb-1 text-[10px] uppercase leading-none tracking-wider text-muted-foreground">
                        {env.remaining >= 0 ? "Left" : "Over"}
                    </div>
                    <div
                        className={cn(
                            "font-mono text-sm font-semibold tabular-nums",
                            env.remaining < 0
                                ? "text-destructive"
                                : env.remaining === 0
                                  ? "text-muted-foreground"
                                  : "text-[color:var(--income)]"
                        )}
                    >
                        ${formatMoney(Math.abs(env.remaining))}
                    </div>
                </div>

                <div className="flex shrink-0 items-center">
                    <PermissionGate roles={["owner", "editor"]}>
                        <EnvelopeAllocateDialog
                            envelopId={env.envelopId}
                            envelopCadence={env.cadence}
                            direction="allocate"
                            trigger={
                                <button
                                    onClick={(e) => e.stopPropagation()}
                                    className="hidden size-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground md:grid"
                                    title="Allocate"
                                >
                                    <ArrowUpFromLine className="size-3.5" />
                                </button>
                            }
                        />
                    </PermissionGate>
                    <PermissionGate roles={["owner"]}>
                        <EnvelopeRowActions env={env} />
                    </PermissionGate>
                    <span
                        className="grid size-7 place-items-center text-muted-foreground transition-transform"
                        style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
                    >
                        <ChevronRight className="size-3.5" />
                    </span>
                </div>
            </div>

            {open && <EnvelopeDetails env={env} />}
        </div>
    );
}

function EnvelopeRowActions({ env }: { env: EnvelopeRow }) {
    const [editOpen, setEditOpen] = useState(false);
    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        onClick={(e) => e.stopPropagation()}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                        title="More"
                    >
                        <MoreHorizontal className="size-3.5" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    onClick={(e) => e.stopPropagation()}
                >
                    <DropdownMenuItem onClick={() => setEditOpen(true)}>
                        <Pencil className="size-3.5" /> Edit envelope
                    </DropdownMenuItem>
                    <DeleteEnvelopeMenuItem envelopId={env.envelopId} />
                </DropdownMenuContent>
            </DropdownMenu>
            <CreateOrEditEnvelopeDialog
                envelope={{
                    envelopId: env.envelopId,
                    name: env.name,
                    color: env.color,
                    icon: env.icon,
                    description: env.description,
                    cadence: env.cadence,
                    carryOver: env.carryOver,
                }}
                open={editOpen}
                onOpenChange={setEditOpen}
                hideDefaultTrigger
            />
        </>
    );
}

function EnvelopeDetails({ env }: { env: EnvelopeRow }) {
    const { space } = useCurrentSpace();
    const pool = env.allocated + env.carryIn;
    return (
        <div className="grid gap-5 border-t border-border/60 bg-background/40 px-4 py-4 md:grid-cols-[1.5fr_1fr]">
            <div>
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Per-account breakdown
                    </span>
                    <Link
                        to={ROUTES.spaceEnvelopeDetail(space.id, env.envelopId)}
                        className="text-[11px] text-primary hover:underline"
                    >
                        View detail →
                    </Link>
                </div>
                {env.breakdown.length === 0 ? (
                    <div className="rounded-lg border border-border/60 bg-card/40 py-6 text-center text-xs text-muted-foreground">
                        No activity yet.
                    </div>
                ) : (
                    <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
                        {env.breakdown.map((b, i) => {
                            const bPool = b.allocated + b.carryIn;
                            const bPct = pctOf(b.consumed, bPool);
                            return (
                                <div
                                    key={i}
                                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-secondary/40"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate font-medium">
                                                {b.accountId
                                                    ? `Account ${b.accountId.slice(0, 6)}`
                                                    : "Unassigned"}
                                            </span>
                                            {b.isDrift && (
                                                <span className="rounded-sm bg-destructive/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-destructive">
                                                    drift
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                                            ${formatMoney(b.consumed)} of $
                                            {formatMoney(bPool)}
                                            {Number.isFinite(bPct) &&
                                                ` · ${bPct.toFixed(0)}%`}
                                        </div>
                                    </div>
                                    <div
                                        className={cn(
                                            "shrink-0 font-mono text-sm tabular-nums",
                                            b.remaining < 0
                                                ? "text-destructive"
                                                : "text-muted-foreground"
                                        )}
                                    >
                                        {b.remaining < 0 ? "Over " : "Left "}
                                        <span className="font-semibold text-foreground">
                                            ${formatMoney(Math.abs(b.remaining))}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                    <MiniStat label="Pool" value={`$${formatMoney(pool)}`} />
                    <MiniStat label="Carry-in" value={`$${formatMoney(env.carryIn)}`} />
                    <MiniStat
                        label="Cadence"
                        value={env.cadence === "monthly" ? "Monthly" : "Rolling"}
                    />
                    <MiniStat
                        label="Carry-over"
                        value={env.carryOver ? "Yes" : "No"}
                    />
                </div>
                <PermissionGate roles={["owner", "editor"]}>
                    <div className="flex gap-2">
                        <EnvelopeAllocateDialog
                            envelopId={env.envelopId}
                            envelopCadence={env.cadence}
                            direction="allocate"
                            trigger={
                                <Button
                                    variant="outline"
                                    className="flex-1 gap-1.5"
                                    size="sm"
                                >
                                    <ArrowUpFromLine className="size-3.5" />
                                    Allocate
                                </Button>
                            }
                        />
                        <EnvelopeAllocateDialog
                            envelopId={env.envelopId}
                            envelopCadence={env.cadence}
                            direction="deallocate"
                            trigger={
                                <Button
                                    variant="outline"
                                    className="flex-1 gap-1.5"
                                    size="sm"
                                >
                                    <ArrowDownToLine className="size-3.5" />
                                    Deallocate
                                </Button>
                            }
                        />
                    </div>
                </PermissionGate>
            </div>
        </div>
    );
}

function MiniStat({
    label,
    value,
    tone = "neutral",
}: {
    label: string;
    value: string;
    tone?: "neutral" | "expense";
}) {
    return (
        <div className="rounded-lg border border-border/60 bg-card/40 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {label}
            </div>
            <div
                className={cn(
                    "mt-0.5 font-mono text-sm tabular-nums",
                    tone === "expense" && "text-[color:var(--expense)]"
                )}
            >
                {value}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// EnvelopeCard (grid view)
// ─────────────────────────────────────────────────────────────

function EnvelopeCard({ env }: { env: EnvelopeRow }) {
    const { space } = useCurrentSpace();
    const pool = env.allocated + env.carryIn;
    const pct = pctOf(env.consumed, pool);
    const level = levelOf(pct);
    const capPct = Math.min(100, Number.isFinite(pct) ? pct : 100);
    const barColor = levelColor(level, env.color);
    const driftCount = env.breakdown.filter((b) => b.isDrift).length;

    return (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20">
            <div className="flex items-start justify-between gap-2">
                <Link
                    to={ROUTES.spaceEnvelopeDetail(space.id, env.envelopId)}
                    className="flex min-w-0 items-center gap-2.5"
                >
                    <EntityAvatar color={env.color} icon={env.icon} size="sm" />
                    <div className="min-w-0">
                        <div className="truncate font-medium">{env.name}</div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span>
                                {env.cadence === "monthly" ? "Monthly" : "Rolling"}
                            </span>
                            {driftCount > 0 && (
                                <>
                                    <span className="text-border">·</span>
                                    <span className="flex items-center gap-1 text-destructive">
                                        <AlertTriangle className="size-2.5" />
                                        drift
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </Link>
                <PermissionGate roles={["owner"]}>
                    <EnvelopeRowActions env={env} />
                </PermissionGate>
            </div>
            <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                    <span
                        className={cn(
                            "font-mono text-xl font-semibold tabular-nums",
                            level === "over" && "text-destructive"
                        )}
                    >
                        ${formatMoney(env.consumed)}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        of ${formatMoney(pool)}
                    </span>
                </div>
                <div className="relative h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                        className="absolute inset-y-0 left-0 transition-all"
                        style={{ width: `${capPct}%`, background: barColor }}
                    />
                </div>
            </div>
            <div className="flex items-center justify-between text-[11px]">
                <span
                    className={cn(
                        "font-mono tabular-nums",
                        level === "over"
                            ? "font-semibold text-destructive"
                            : "text-muted-foreground"
                    )}
                >
                    {Number.isFinite(pct) ? `${pct.toFixed(0)}%` : "—"}
                    {level === "over" && Number.isFinite(pct) && " over"}
                </span>
                <span
                    className={cn(
                        "font-mono tabular-nums",
                        env.remaining < 0 ? "text-destructive" : "text-muted-foreground"
                    )}
                >
                    {env.remaining < 0 ? "Over " : "Left "}
                    <span className="font-semibold text-foreground">
                        ${formatMoney(Math.abs(env.remaining))}
                    </span>
                </span>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Create / Edit / Delete (preserved from original with a minor
// adaptation so the trigger can be hidden when controlled externally)
// ─────────────────────────────────────────────────────────────

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
}: {
    envelope?: EditableEnvelope;
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
    hideDefaultTrigger?: boolean;
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
    const [carryOver, setCarryOver] = useState<boolean>(envelope?.carryOver ?? false);

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

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {!hideDefaultTrigger && (
                <DialogTrigger asChild>
                    {editing ? (
                        <Button size="icon" variant="ghost" className="size-7">
                            <Pencil className="size-3.5" />
                        </Button>
                    ) : (
                        <Button variant="gradient">
                            <Plus />
                            New envelope
                        </Button>
                    )}
                </DialogTrigger>
            )}
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {editing ? "Edit envelope" : "Create envelope"}
                    </DialogTitle>
                    <DialogDescription>
                        Envelopes hold allocated amounts for spending categories.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                        e.preventDefault();
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
                    }}
                >
                    <div className="grid gap-1.5">
                        <Label htmlFor="envelope-name">Name</Label>
                        <Input
                            id="envelope-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Groceries, Entertainment…"
                            required
                            maxLength={255}
                            autoFocus
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="envelope-description">Description (optional)</Label>
                        <Textarea
                            id="envelope-description"
                            rows={2}
                            maxLength={2000}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What does this envelope cover?"
                        />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label>Cadence</Label>
                            <Select
                                value={cadence}
                                onValueChange={(v) => setCadence(v as Cadence)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">
                                        Rolling (accumulates)
                                    </SelectItem>
                                    <SelectItem value="monthly">
                                        Monthly (resets on the 1st)
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {cadence !== "none" && (
                            <div className="grid gap-1.5">
                                <Label>Carry-over</Label>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={carryOver}
                                    onClick={() => setCarryOver((s) => !s)}
                                    className={cn(
                                        "flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm transition-colors",
                                        carryOver
                                            ? "bg-primary/10 text-primary"
                                            : "text-muted-foreground"
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "inline-block size-4 rounded-full border border-border",
                                            carryOver && "bg-primary"
                                        )}
                                    />
                                    {carryOver
                                        ? "Unused rolls into next month"
                                        : "Unused disappears"}
                                </button>
                            </div>
                        )}
                    </div>
                    <EntityStyleFields
                        name={name}
                        color={color}
                        setColor={setColor}
                        icon={icon}
                        setIcon={setIcon}
                    />
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="gradient"
                            disabled={!name.trim() || pending}
                        >
                            {pending ? "Saving…" : editing ? "Save" : "Create"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

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

