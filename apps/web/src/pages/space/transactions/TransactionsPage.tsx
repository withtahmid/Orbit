import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
    Plus,
    Search,
    X,
    Filter as FilterIcon,
    ChevronDown,
    Trash2,
    Wallet,
    Folder,
    Calendar as CalendarIcon,
    FileText,
    ArrowDown,
    ArrowUp,
    ArrowRightLeft,
    Edit3,
    Loader2,
    Check,
} from "lucide-react";
import { formatInAppTz } from "@/lib/formatDate";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    OrbitFormStyles,
    OrbitInput,
    OrbitSelect,
    OrbitFieldRow,
} from "@/components/orbit/OrbitForm";
import { OrbitField } from "@/components/orbit/OrbitModalShell";
import { Button } from "@/components/ui/button";
import { CategoryTreeSelect } from "@/components/shared/CategoryTreeSelect";
import { DateRangePicker } from "@/components/shared/DateRangePicker";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { trpc } from "@/trpc";
import { useInvalidateAnalytics } from "@/lib/invalidate";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { NewTransactionSheet } from "@/features/transactions/NewTransactionSheet";
import { EditTransactionSheet } from "@/features/transactions/EditTransactionSheet";
import { TransactionDetailsSheet } from "@/features/transactions/TransactionDetailsSheet";
import { ROUTES } from "@/router/routes";
import { useStore } from "@/stores/useStore";
import { UNALLOCATED_COLOR } from "@/lib/entityStyle";

type TxType = "income" | "expense" | "transfer" | "adjustment";

const TYPE_OPTIONS: Array<{ value: TxType | null; label: string }> = [
    { value: null, label: "All" },
    { value: "income", label: "Income" },
    { value: "expense", label: "Expense" },
    { value: "transfer", label: "Transfer" },
    { value: "adjustment", label: "Adjustment" },
];

/* Group a flat list of transactions into consecutive same-calendar-day
   buckets in the app timezone. The list arrives ordered by
   `transaction_datetime DESC`, so a single linear pass produces groups
   in display order with no extra sorting. Labels: "Today" / "Yesterday"
   for the recent two, day-name + date for older entries, with year
   appended once we cross years. */
type DayGroup<T> = { key: string; label: string; items: T[] };

function groupByDay<T extends { transaction_datetime: string | Date }>(
    items: T[],
    todayKey: string,
    yesterdayKey: string,
    thisYear: string
): DayGroup<T>[] {
    if (items.length === 0) return [];
    const groups: DayGroup<T>[] = [];
    for (const item of items) {
        const key = formatInAppTz(item.transaction_datetime, "yyyy-MM-dd");
        let group = groups[groups.length - 1];
        if (!group || group.key !== key) {
            let label: string;
            if (key === todayKey) label = "Today";
            else if (key === yesterdayKey) label = "Yesterday";
            else {
                const year = formatInAppTz(item.transaction_datetime, "yyyy");
                label =
                    year === thisYear
                        ? formatInAppTz(item.transaction_datetime, "EEEE, MMM d")
                        : formatInAppTz(
                              item.transaction_datetime,
                              "EEEE, MMM d, yyyy"
                          );
            }
            group = { key, label, items: [] };
            groups.push(group);
        }
        group.items.push(item);
    }
    return groups;
}

function DayHeader({ label }: { label: string }) {
    return (
        <div className="tx-day-header" role="separator">
            <span className="tx-day-label">{label}</span>
        </div>
    );
}

const PERIOD_PRESETS: Array<{ value: string; label: string }> = [
    { value: "this-month", label: "This month" },
    { value: "last-month", label: "Last month" },
    { value: "last-3-months", label: "Last 3 months" },
    { value: "last-12-months", label: "Last 12 months" },
    { value: "this-year", label: "This year" },
    { value: "all-time", label: "All time" },
];

export default function TransactionsPage() {
    const { space } = useCurrentSpace();
    const isPersonal = space.isPersonal;
    const { authStore } = useStore();
    const { period, preset, setPreset, setCustom } = usePeriod("this-month");

    const [params, setParams] = useSearchParams();
    const setParam = (key: string, v: string | null) =>
        setParams(
            (p) => {
                const next = new URLSearchParams(p);
                if (v === null || v === "") next.delete(key);
                else next.set(key, v);
                return next;
            },
            { replace: true }
        );

    const type = (params.get("type") as TxType | null) ?? null;
    const accountId = params.get("account");
    const categoryId = params.get("category");
    const eventId = params.get("event");
    const userId = params.get("user");
    const searchRaw = params.get("q") ?? "";
    const amountMin = params.get("min");
    const amountMax = params.get("max");
    const search = useDebouncedValue(searchRaw, 300);

    const accountsSpaceQuery = trpc.account.listBySpace.useQuery(
        { spaceId: space.id },
        { enabled: !isPersonal }
    );
    const accountsPersonalQuery = trpc.personal.ownedAccounts.useQuery(undefined, {
        enabled: isPersonal,
    });
    const accountsData = isPersonal
        ? (accountsPersonalQuery.data ?? []).map((a) => ({
              id: a.id,
              name: a.name,
              color: a.color,
              icon: a.icon,
          }))
        : (accountsSpaceQuery.data ?? []).map((a) => ({
              id: a.id,
              name: a.name,
              color: a.color,
              icon: a.icon,
          }));

    const categoriesSpaceQuery = trpc.expenseCategory.listBySpace.useQuery(
        { spaceId: space.id },
        { enabled: !isPersonal }
    );
    const categoriesPersonalQuery = trpc.personal.listCategories.useQuery(undefined, {
        enabled: isPersonal,
    });
    const categoriesData = isPersonal
        ? categoriesPersonalQuery.data ?? []
        : categoriesSpaceQuery.data ?? [];

    const eventsQuery = trpc.event.listBySpace.useQuery(
        { spaceId: space.id },
        { enabled: !isPersonal }
    );

    const [pageCursors, setPageCursors] = useState<(string | null)[]>([null]);
    const cursor = pageCursors[pageCursors.length - 1];
    const [selectedTx, setSelectedTx] = useState<any>(null);

    const listSpaceQuery = trpc.transaction.listBySpace.useQuery(
        {
            spaceId: space.id,
            type,
            accountId: accountId || null,
            expenseCategoryId: categoryId || null,
            eventId: eventId || null,
            userId: userId || null,
            search: search || null,
            amountMin: amountMin ? Number(amountMin) : null,
            amountMax: amountMax ? Number(amountMax) : null,
            dateFrom: period.start,
            dateTo: period.end,
            cursor: cursor,
            limit: 50,
        },
        { enabled: !isPersonal }
    );
    const listPersonalQuery = trpc.personal.transactions.useQuery(
        {
            type,
            accountId: accountId || null,
            expenseCategoryId: categoryId || null,
            eventId: eventId || null,
            userId: userId || null,
            search: search || null,
            amountMin: amountMin ? Number(amountMin) : null,
            amountMax: amountMax ? Number(amountMax) : null,
            dateFrom: period.start,
            dateTo: period.end,
            cursor: cursor,
            limit: 50,
        },
        { enabled: isPersonal }
    );
    const listQuery = isPersonal ? listPersonalQuery : listSpaceQuery;

    const accountsById = useMemo(() => {
        const m = new Map<string, { name: string; color: string; icon: string }>();
        for (const a of accountsData)
            m.set(a.id, { name: a.name, color: a.color, icon: a.icon });
        return m;
    }, [accountsData]);

    const categoriesById = useMemo(() => {
        const m = new Map<string, { name: string; color: string; icon: string }>();
        for (const c of categoriesData)
            m.set(c.id, { name: c.name, color: c.color, icon: c.icon });
        return m;
    }, [categoriesData]);

    const eventsById = useMemo(() => {
        const m = new Map<string, { name: string; color: string; icon: string }>();
        for (const ev of eventsQuery.data ?? [])
            m.set(ev.id, { name: ev.name, color: ev.color, icon: ev.icon });
        return m;
    }, [eventsQuery.data]);

    const invalidate = useInvalidateAnalytics();
    const del = trpc.transaction.delete.useMutation({
        onSuccess: async () => {
            toast.success("Transaction deleted");
            await invalidate(space.id);
        },
        onError: (e) => toast.error(e.message),
    });

    const activeFilterCount = [
        type,
        accountId,
        categoryId,
        eventId,
        userId,
        amountMin,
        amountMax,
    ].filter(Boolean).length;

    const items = listQuery.data?.items ?? [];
    /* Recompute the "Today" / "Yesterday" reference keys on every render
       (cheap), then memoize the actual grouping on those keys. This way
       a page left open across midnight relabels its rows the next time
       anything triggers a re-render, instead of staying stuck on the
       previous day's labels until the query data changes. */
    const now = new Date();
    const todayKey = formatInAppTz(now, "yyyy-MM-dd");
    const yesterdayKey = formatInAppTz(
        new Date(now.getTime() - 86_400_000),
        "yyyy-MM-dd"
    );
    const thisYear = formatInAppTz(now, "yyyy");
    const dayGroups = useMemo(
        () => groupByDay(items, todayKey, yesterdayKey, thisYear),
        [items, todayKey, yesterdayKey, thisYear]
    );

    /* IN/OUT/NET/AVG-DAY summary for the entire filtered set (not just
       the current page). Same filter shape as listBySpace / personal.transactions.
       Memoized so the object identity is stable across renders — cheap,
       and avoids a fresh hash key in tRPC's react-query layer per render. */
    const filteredTotalsInput = useMemo(
        () => ({
            type,
            accountId: accountId || null,
            expenseCategoryId: categoryId || null,
            eventId: eventId || null,
            userId: userId || null,
            search: search || null,
            amountMin: amountMin ? Number(amountMin) : null,
            amountMax: amountMax ? Number(amountMax) : null,
            dateFrom: period.start,
            dateTo: period.end,
        }),
        [
            type,
            accountId,
            categoryId,
            eventId,
            userId,
            search,
            amountMin,
            amountMax,
            period.start,
            period.end,
        ]
    );
    const filteredTotalsSpaceQuery = trpc.transaction.filteredTotals.useQuery(
        { spaceId: space.id, ...filteredTotalsInput },
        { enabled: !isPersonal }
    );
    const filteredTotalsPersonalQuery =
        trpc.personal.transactionFilteredTotals.useQuery(filteredTotalsInput, {
            enabled: isPersonal,
        });
    const totalsData =
        (isPersonal
            ? filteredTotalsPersonalQuery.data
            : filteredTotalsSpaceQuery.data) ?? null;
    const summary = totalsData
        ? {
              inTotal: totalsData.inTotal,
              outTotal: totalsData.outTotal,
              net: totalsData.net,
              avg: totalsData.avgPerDay,
          }
        : { inTotal: 0, outTotal: 0, net: 0, avg: 0 };

    const periodLabel = useMemo(() => {
        if (preset === "this-month") return formatInAppTz(period.start, "MMMM yyyy");
        if (preset === "last-month") return formatInAppTz(period.start, "MMMM yyyy");
        if (preset === "this-year") return formatInAppTz(period.start, "yyyy");
        if (preset === "all-time") return "All time";
        const found = PERIOD_PRESETS.find((p) => p.value === preset);
        if (found) return found.label;
        return `${formatInAppTz(period.start, "MMM d")} → ${formatInAppTz(period.end, "MMM d, yyyy")}`;
    }, [preset, period.start, period.end]);

    const periodChipLabel = useMemo(() => {
        const found = PERIOD_PRESETS.find((p) => p.value === preset);
        if (found) return found.label;
        /* Custom range — show the dates compactly. */
        return `${formatInAppTz(period.start, "MMM d")} → ${formatInAppTz(period.end, "MMM d")}`;
    }, [preset, period.start, period.end]);

    const resetFilters = () => {
        setParams(
            (p) => {
                const next = new URLSearchParams();
                const period = p.get("period");
                const from = p.get("from");
                const to = p.get("to");
                if (period) next.set("period", period);
                if (from) next.set("from", from);
                if (to) next.set("to", to);
                return next;
            },
            { replace: true }
        );
        setPageCursors([null]);
    };

    /* Active filter chips (for the row beneath the filter dropdowns). */
    const activeChips: Array<{ key: string; label: string; color?: string; icon?: string; onRemove: () => void }> = [];
    if (type) {
        activeChips.push({
            key: "type",
            label: TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type,
            onRemove: () => setParam("type", null),
        });
    }
    if (accountId) {
        const a = accountsById.get(accountId);
        activeChips.push({
            key: "account",
            label: a?.name ?? "Account",
            color: a?.color,
            icon: a?.icon,
            onRemove: () => setParam("account", null),
        });
    }
    if (categoryId) {
        const c = categoriesById.get(categoryId);
        activeChips.push({
            key: "category",
            label: c?.name ?? "Category",
            color: c?.color,
            icon: c?.icon,
            onRemove: () => setParam("category", null),
        });
    }
    if (eventId) {
        const ev = eventsById.get(eventId);
        activeChips.push({
            key: "event",
            label: ev?.name ?? "Event",
            color: ev?.color,
            onRemove: () => setParam("event", null),
        });
    }

    return (
        <div className="orbit-design tx-root">
            <style>{TX_STYLES}</style>

            {/* Topbar */}
            <header className="tx-topbar">
                <div className="tx-topbar-text">
                    <span className="eyebrow">
                        {items.length} results · {periodLabel}
                    </span>
                    <h1 className="display tx-title">Transactions</h1>
                    <p className="tx-sub">
                        {isPersonal
                            ? "Every transaction across the accounts you own."
                            : "All money movement in this space."}
                    </p>
                </div>
                <div className="tx-topbar-actions">
                    <button type="button" className="od-btn">
                        <FileText className="size-3.5" /> Export
                    </button>
                    <PermissionGate roles={["owner", "editor"]}>
                        <NewTransactionSheet
                            trigger={
                                <button
                                    type="button"
                                    className="od-btn od-btn-primary"
                                >
                                    <Plus className="size-3.5" /> New transaction
                                </button>
                            }
                        />
                    </PermissionGate>
                </div>
            </header>

            <div className="tx-scroll">
                {/* Filter strip */}
                <div className="od-card tx-filters">
                    <div className="tx-filter-row1">
                        <label className="tx-search">
                            <Search
                                className="size-3.5"
                                style={{ color: "var(--fg-4)" }}
                            />
                            <input
                                className="od-input tx-search-input"
                                placeholder="Search description, location, or amount…"
                                value={searchRaw}
                                onChange={(e) => setParam("q", e.target.value)}
                            />
                        </label>
                        <PeriodChip
                            preset={preset}
                            period={period}
                            label={periodChipLabel}
                            onPresetChange={setPreset}
                            onCustomChange={setCustom}
                            icon={<CalendarIcon className="size-3.5" />}
                        />
                        <FilterChipPicker
                            label={
                                accountId
                                    ? accountsById.get(accountId)?.name ?? "Account"
                                    : "All accounts"
                            }
                            icon={<Wallet className="size-3.5" />}
                            options={[
                                { value: null, label: "All accounts" },
                                ...accountsData.map((a) => ({
                                    value: a.id,
                                    label: a.name,
                                })),
                            ]}
                            value={accountId}
                            onChange={(v) => setParam("account", v)}
                        />
                        <Popover>
                            <PopoverTrigger asChild>
                                <button type="button" className="od-btn">
                                    <Folder className="size-3.5" />
                                    {categoryId
                                        ? categoriesById.get(categoryId)?.name ??
                                          "Category"
                                        : "Any category"}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="orbit-design w-72 p-3">
                                <CategoryTreeSelect
                                    categories={categoriesData as any}
                                    value={categoryId}
                                    onChange={(id) => setParam("category", id)}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="tx-filter-row2">
                        <div className="tx-typebar">
                            {TYPE_OPTIONS.map((o) => (
                                <button
                                    key={String(o.value)}
                                    type="button"
                                    className={`tx-typebar-cell ${type === o.value ? "is-active" : ""}`}
                                    onClick={() => setParam("type", o.value)}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>

                        {activeChips.length > 0 && (
                            <span className="tx-filter-divider" />
                        )}
                        {activeChips.map((c) => (
                            <button
                                key={c.key}
                                type="button"
                                onClick={c.onRemove}
                                className="tx-active-chip"
                                style={
                                    c.color
                                        ? {
                                              background: `color-mix(in oklab, ${c.color} 12%, transparent)`,
                                              borderColor: `color-mix(in oklab, ${c.color} 30%, transparent)`,
                                              color: c.color,
                                          }
                                        : undefined
                                }
                            >
                                {c.label}
                                <X className="size-3" />
                            </button>
                        ))}
                        <MoreFiltersSheet
                            type={type}
                            setType={(v) => setParam("type", v)}
                            accountId={accountId}
                            setAccountId={(v) => setParam("account", v)}
                            categoryId={categoryId}
                            setCategoryId={(v) => setParam("category", v)}
                            eventId={eventId}
                            setEventId={(v) => setParam("event", v)}
                            amountMin={amountMin}
                            setAmountMin={(v) => setParam("min", v)}
                            amountMax={amountMax}
                            setAmountMax={(v) => setParam("max", v)}
                            accounts={accountsData}
                            categories={categoriesData as any}
                            events={eventsQuery.data ?? []}
                            activeFilterCount={activeFilterCount}
                            hideEvents={isPersonal}
                        />
                        {activeFilterCount > 0 && (
                            <button
                                type="button"
                                className="od-btn od-btn-ghost od-btn-sm"
                                style={{ color: "var(--fg-3)" }}
                                onClick={resetFilters}
                            >
                                <X className="size-3.5" /> Clear
                            </button>
                        )}
                        <span className="tx-filter-count">
                            {items.length}
                            {listQuery.data?.nextCursor ? "+" : ""} transactions
                        </span>
                    </div>
                </div>

                {/* Daily summary strip */}
                <div className="od-card tx-summary">
                    <SummaryCell
                        label="In"
                        amount={summary.inTotal}
                        variant="income"
                        signed
                    />
                    <SummaryCell
                        label="Out"
                        amount={summary.outTotal}
                        variant="expense"
                    />
                    <SummaryCell
                        label="Net"
                        amount={summary.net}
                        variant={summary.net >= 0 ? "income" : "expense"}
                        signed
                    />
                    <SummaryCell
                        label="Avg / day"
                        amount={summary.avg}
                        variant="neutral"
                    />
                </div>

                {/* Table */}
                <div className="od-card tx-table-card">
                    <div className="tx-table-head tx-row-grid">
                        {[
                            "Date",
                            "Type",
                            "From / To",
                            "Category",
                            "Event",
                            "By",
                            "Amount",
                            "",
                        ].map((h, i) => (
                            <span
                                key={i}
                                className="tx-th"
                                style={{ textAlign: i === 6 ? "right" : "left" }}
                            >
                                {h}
                            </span>
                        ))}
                    </div>
                    {listQuery.isLoading ? (
                        <div className="tx-empty">
                            <Loader2 className="size-4 animate-spin" />
                            Loading…
                        </div>
                    ) : items.length === 0 ? (
                        <div className="tx-empty">
                            {activeFilterCount > 0
                                ? "No transactions match your filters."
                                : "No transactions yet."}
                        </div>
                    ) : (
                        <>
                            {/* Desktop rows */}
                            <div className="tx-rows tx-rows-desktop">
                                {dayGroups.map((g) => (
                                    <div key={g.key} className="tx-day-block">
                                        <DayHeader label={g.label} />
                                        {g.items.map((t) => {
                                            const tt =
                                                (t.type as unknown as TxType) ?? "expense";
                                            const cat = t.expense_category_id
                                                ? categoriesById.get(t.expense_category_id)
                                                : null;
                                            const ev = t.event_id
                                                ? eventsById.get(t.event_id)
                                                : null;
                                            const canDelete =
                                                t.created_by === authStore.user?.id;
                                            return (
                                        <div
                                            key={t.id}
                                            className="tx-row tx-row-grid"
                                            onClick={() => setSelectedTx(t)}
                                        >
                                            <span className="tx-cell-date">
                                                <span className="tx-date">
                                                    {formatInAppTz(
                                                        t.transaction_datetime,
                                                        "MMM d"
                                                    )}
                                                </span>
                                                <span className="tx-time mono">
                                                    {formatInAppTz(
                                                        t.transaction_datetime,
                                                        "HH:mm"
                                                    )}
                                                </span>
                                            </span>
                                            <span>
                                                <TxBadge type={tt} />
                                            </span>
                                            <AccountFlow
                                                spaceId={
                                                    (t as { space_id?: string })
                                                        .space_id ?? space.id
                                                }
                                                from={t.source_account_id}
                                                to={t.destination_account_id}
                                                accountsById={accountsById}
                                            />
                                            <span className="tx-cell-cat">
                                                {cat ? (
                                                    <>
                                                        <Avatar
                                                            color={cat.color}
                                                            icon={cat.icon}
                                                            size={20}
                                                        />
                                                        <span style={{ color: "var(--fg-2)" }}>
                                                            {cat.name}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span style={{ color: "var(--fg-4)" }}>
                                                        —
                                                    </span>
                                                )}
                                            </span>
                                            <span style={{ color: "var(--fg-4)" }}>
                                                {ev ? (
                                                    <span
                                                        className="tx-event-chip"
                                                        style={{
                                                            background: `color-mix(in oklab, ${ev.color} 12%, transparent)`,
                                                            color: ev.color,
                                                            borderColor: `color-mix(in oklab, ${ev.color} 30%, transparent)`,
                                                        }}
                                                    >
                                                        {ev.name}
                                                    </span>
                                                ) : (
                                                    "—"
                                                )}
                                            </span>
                                            <span className="tx-cell-by">
                                                <UserBubble
                                                    initial={
                                                        t.created_by_first_name?.[0]?.toUpperCase() ??
                                                        "?"
                                                    }
                                                />
                                                <span
                                                    style={{
                                                        color: "var(--fg-3)",
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    {t.created_by_first_name ?? "—"}
                                                </span>
                                            </span>
                                            <span className="tx-cell-amt">
                                                <Money
                                                    amount={
                                                        tt === "expense"
                                                            ? -Number(t.amount)
                                                            : Number(t.amount)
                                                    }
                                                    variant={
                                                        tt === "income"
                                                            ? "income"
                                                            : tt === "transfer"
                                                              ? "transfer"
                                                              : tt === "adjustment"
                                                                ? "warn"
                                                                : "expense"
                                                    }
                                                    signed={tt === "income"}
                                                    size={13}
                                                    weight={500}
                                                />
                                                {t.description && (
                                                    <span className="tx-cell-desc">
                                                        {t.description}
                                                    </span>
                                                )}
                                            </span>
                                            <span
                                                className="tx-cell-actions"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {canDelete && (
                                                    <EditTransactionSheet
                                                        transaction={t}
                                                    />
                                                )}
                                                {canDelete && (
                                                    <ConfirmDialog
                                                        trigger={
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="size-7"
                                                            >
                                                                <Trash2 className="size-3.5" />
                                                            </Button>
                                                        }
                                                        title="Delete transaction?"
                                                        description="Balances will update automatically."
                                                        confirmLabel="Delete"
                                                        destructive
                                                        onConfirm={() =>
                                                            del.mutate({
                                                                transactionId: t.id,
                                                            })
                                                        }
                                                    />
                                                )}
                                            </span>
                                        </div>
                                    );
                                        })}
                                    </div>
                                ))}
                            </div>

                            {/* Mobile rows — compressed list */}
                            <div className="tx-rows-mobile">
                                {dayGroups.map((g) => (
                                    <div key={g.key} className="tx-day-block">
                                        <DayHeader label={g.label} />
                                        {g.items.map((t) => {
                                    const tt = (t.type as unknown as TxType) ?? "expense";
                                    const cat = t.expense_category_id
                                        ? categoriesById.get(t.expense_category_id)
                                        : null;
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            className="tx-mrow"
                                            onClick={() => setSelectedTx(t)}
                                        >
                                            <Avatar
                                                color={cat?.color ?? UNALLOCATED_COLOR}
                                                icon={cat?.icon ?? "wallet"}
                                                size={32}
                                            />
                                            <div className="tx-mrow-text">
                                                <div className="tx-mrow-top">
                                                    <TxBadge type={tt} />
                                                    <span className="tx-mrow-date">
                                                        {formatInAppTz(
                                                            t.transaction_datetime,
                                                            "MMM d"
                                                        )}
                                                    </span>
                                                </div>
                                                <div className="tx-mrow-name">
                                                    {cat?.name ?? t.description ?? "—"}
                                                </div>
                                                {t.description && cat && (
                                                    <div className="tx-mrow-desc">
                                                        {t.description}
                                                    </div>
                                                )}
                                            </div>
                                            <Money
                                                amount={
                                                    tt === "expense"
                                                        ? -Number(t.amount)
                                                        : Number(t.amount)
                                                }
                                                variant={
                                                    tt === "income"
                                                        ? "income"
                                                        : tt === "transfer"
                                                          ? "transfer"
                                                          : tt === "adjustment"
                                                            ? "warn"
                                                            : "expense"
                                                }
                                                signed={tt === "income"}
                                                size={13}
                                                weight={500}
                                            />
                                        </button>
                                    );
                                        })}
                                    </div>
                                ))}
                            </div>

                            <div className="tx-table-foot">
                                <span style={{ fontSize: 12, color: "var(--fg-4)" }}>
                                    Showing {items.length}
                                    {listQuery.data?.nextCursor ? "+" : ""}{" "}
                                    transactions
                                </span>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                        type="button"
                                        className="od-btn od-btn-sm"
                                        disabled={pageCursors.length <= 1}
                                        onClick={() =>
                                            setPageCursors((p) => p.slice(0, -1))
                                        }
                                    >
                                        Previous
                                    </button>
                                    <button
                                        type="button"
                                        className="od-btn od-btn-sm"
                                        disabled={!listQuery.data?.nextCursor}
                                        onClick={() =>
                                            setPageCursors((p) => [
                                                ...p,
                                                listQuery.data!.nextCursor!,
                                            ])
                                        }
                                    >
                                        Load 50 more
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <TransactionDetailsSheet
                transaction={selectedTx}
                open={selectedTx !== null}
                onClose={() => setSelectedTx(null)}
                accountsById={accountsById}
                categoriesById={categoriesById}
                eventsById={eventsById}
                canEdit={selectedTx?.created_by === authStore.user?.id}
            />
        </div>
    );
}

/* ============================================================
   Helper components
   ============================================================ */

function Money({
    amount,
    variant = "neutral",
    signed = false,
    size = 13,
    weight = 500,
    decimals = 2,
}: {
    amount: number;
    variant?:
        | "neutral"
        | "income"
        | "expense"
        | "transfer"
        | "muted"
        | "warn";
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

function TxBadge({ type }: { type: TxType }) {
    const map: Record<
        TxType,
        { color: string; label: string; icon: ReactNode }
    > = {
        income: { color: "var(--income)", label: "Income", icon: <ArrowDown className="size-3" /> },
        expense: { color: "var(--expense)", label: "Expense", icon: <ArrowUp className="size-3" /> },
        transfer: { color: "var(--transfer)", label: "Transfer", icon: <ArrowRightLeft className="size-3" /> },
        adjustment: { color: "var(--warn)", label: "Adjustment", icon: <Edit3 className="size-3" /> },
    };
    const m = map[type];
    return (
        <span
            className="tx-badge"
            style={{
                color: m.color,
                background: `color-mix(in oklab, ${m.color} 12%, transparent)`,
                borderColor: `color-mix(in oklab, ${m.color} 30%, transparent)`,
            }}
        >
            {m.icon} {m.label}
        </span>
    );
}

function Avatar({
    icon,
    color,
    size = 22,
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
                borderRadius: 6,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: `color-mix(in oklab, ${color} 18%, transparent)`,
                border: `1px solid color-mix(in oklab, ${color} 30%, transparent)`,
                color: color,
                flexShrink: 0,
            }}
        >
            <AvatarIcon name={icon} size={size * 0.5} color={color} />
        </span>
    );
}

const AVATAR_ICONS: Record<string, string> = {
    home: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
    wallet:
        "M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1h2v8h-2v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm14 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
    cart: "M3 4h2l3 12h11l2-8H7M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    car: "M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13m-14 0v5h2v-2h10v2h2v-5m-14 0h14M7 16h.01M17 16h.01",
    book: "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM4 17a3 3 0 0 1 3-3h11",
    coffee:
        "M5 8h12v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zm12 1h2a2 2 0 1 1 0 4h-2zM7 4v2M11 4v2M15 4v2",
    flame: "M12 22s7-4 7-10c0-3-2-5-3-6 0 2-1 3-2 3-1-3-3-5-3-7-2 1-6 5-6 10 0 6 7 10 7 10z",
    music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zm11-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3z",
    camera: "M3 8h4l2-3h6l2 3h4v11H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
    bolt: "M13 2 3 14h7l-1 8 10-12h-7z",
    terminal: "m4 6 6 6-6 6m8 0h8",
    layers: "m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5M3 17l9 5 9-5",
    target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-4a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    folder: "M3 6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
    share: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4m4-4v13",
    edit: "M4 20h4l10-10-4-4L4 16zM14 6l4 4",
    dot: "M12 12h.01",
};

function AvatarIcon({
    name,
    size = 11,
    color = "currentColor",
}: {
    name: string;
    size?: number;
    color?: string;
}) {
    const d = AVATAR_ICONS[name] ?? AVATAR_ICONS.dot;
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

function UserBubble({ initial }: { initial: string }) {
    return (
        <span
            style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "linear-gradient(135deg, var(--ent-3), var(--ent-4))",
                display: "grid",
                placeItems: "center",
                fontSize: 9.5,
                fontWeight: 600,
                color: "white",
                flexShrink: 0,
            }}
        >
            {initial}
        </span>
    );
}

function AccountFlow({
    spaceId,
    from,
    to,
    accountsById,
}: {
    spaceId: string;
    from: string | null;
    to: string | null;
    accountsById: Map<string, { name: string; color: string; icon: string }>;
}) {
    const fromAcc = from ? accountsById.get(from) : null;
    const toAcc = to ? accountsById.get(to) : null;
    return (
        <span
            className="tx-cell-flow"
            onClick={(e) => e.stopPropagation()}
        >
            {fromAcc ? (
                <Link
                    to={ROUTES.spaceAccountDetail(spaceId, from!)}
                    className="tx-flow-acct"
                >
                    <span style={{ color: "var(--fg-2)" }}>{fromAcc.name}</span>
                </Link>
            ) : (
                <span style={{ color: "var(--fg-4)" }}>—</span>
            )}
            {toAcc && (
                <>
                    <ArrowRightLeft className="size-3" style={{ color: "var(--fg-4)" }} />
                    <Link
                        to={ROUTES.spaceAccountDetail(spaceId, to!)}
                        className="tx-flow-acct"
                    >
                        <span style={{ color: "var(--fg)" }}>{toAcc.name}</span>
                    </Link>
                </>
            )}
        </span>
    );
}

function SummaryCell({
    label,
    amount,
    variant,
    signed,
}: {
    label: string;
    amount: number;
    variant: "income" | "expense" | "neutral";
    signed?: boolean;
}) {
    return (
        <div className="tx-summary-cell">
            <span className="tx-summary-label">{label}</span>
            <span className="tx-summary-amt">
                <Money
                    amount={amount}
                    variant={variant}
                    signed={signed}
                    size={20}
                    weight={500}
                />
            </span>
        </div>
    );
}

function PeriodChip({
    period,
    label,
    onCustomChange,
    icon,
}: {
    preset: string;
    period: { start: Date; end: Date };
    label: string;
    onPresetChange: (preset: any) => void;
    onCustomChange: (start: Date, end: Date) => void;
    icon?: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button" className="od-btn">
                    {icon ?? <FilterIcon className="size-3.5" />}
                    {label}
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

function FilterChipPicker({
    label,
    icon,
    options,
    value,
    onChange,
}: {
    label: string;
    icon?: ReactNode;
    options: Array<{ value: string | null; label: string }>;
    value: string | null;
    onChange: (v: string | null) => void;
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button type="button" className="od-btn">
                    {icon}
                    {label}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="orbit-design w-56 p-1">
                {options.map((o) => (
                    <button
                        key={String(o.value)}
                        type="button"
                        className="tx-popover-item"
                        onClick={() => onChange(o.value)}
                    >
                        {o.label}
                        {value === o.value && (
                            <Check
                                className="size-3.5 ml-auto"
                                style={{ color: "var(--brand)" }}
                            />
                        )}
                    </button>
                ))}
            </PopoverContent>
        </Popover>
    );
}

function MoreFiltersSheet({
    type,
    setType,
    accountId,
    setAccountId,
    categoryId,
    setCategoryId,
    eventId,
    setEventId,
    amountMin,
    setAmountMin,
    amountMax,
    setAmountMax,
    accounts,
    categories,
    events,
    activeFilterCount,
    hideEvents = false,
}: {
    type: TxType | null;
    setType: (v: string | null) => void;
    accountId: string | null;
    setAccountId: (v: string | null) => void;
    categoryId: string | null;
    setCategoryId: (v: string | null) => void;
    eventId: string | null;
    setEventId: (v: string | null) => void;
    amountMin: string | null;
    setAmountMin: (v: string | null) => void;
    amountMax: string | null;
    setAmountMax: (v: string | null) => void;
    accounts: Array<{ id: string; name: string }>;
    categories: Array<{
        id: string;
        name: string;
        parent_id: string | null;
        color: string;
        icon: string;
    }>;
    events: Array<{ id: string; name: string }>;
    activeFilterCount: number;
    hideEvents?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const reset = () => {
        setType(null);
        setAccountId(null);
        setCategoryId(null);
        setEventId(null);
        setAmountMin(null);
        setAmountMax(null);
    };
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button" className="tx-add-filter">
                    <Plus className="size-3" /> Add filter
                    {activeFilterCount > 0 && (
                        <span className="tx-filter-badge">{activeFilterCount}</span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                sideOffset={6}
                className="orbit-design tx-filter-pop"
            >
                <OrbitFormStyles />
                <style>{TX_FILTER_POP_STYLES}</style>

                <div className="tx-filter-pop-head">
                    <span className="tx-filter-pop-eyebrow">Filter transactions</span>
                    <button
                        type="button"
                        className="orbit-btn orbit-btn-ghost orbit-btn-sm"
                        onClick={reset}
                        disabled={activeFilterCount === 0}
                    >
                        Reset
                    </button>
                </div>

                <OrbitField label="Type">
                    <div className="tx-filter-pop-types">
                        {TYPE_OPTIONS.filter((o) => o.value !== null).map((o) => {
                            const active = type === o.value;
                            const tone =
                                o.value === "income"
                                    ? { c: "var(--income)", soft: "var(--income-soft)", I: ArrowDown }
                                    : o.value === "expense"
                                      ? { c: "var(--expense)", soft: "var(--expense-soft)", I: ArrowUp }
                                      : o.value === "transfer"
                                        ? { c: "var(--transfer)", soft: "var(--transfer-soft, color-mix(in oklab, var(--transfer) 14%, transparent))", I: ArrowRightLeft }
                                        : { c: "var(--gold)", soft: "var(--gold-soft)", I: Edit3 };
                            return (
                                <button
                                    key={String(o.value)}
                                    type="button"
                                    onClick={() => setType(active ? null : o.value)}
                                    className="tx-filter-pop-type-chip"
                                    style={
                                        active
                                            ? {
                                                  background: tone.soft,
                                                  borderColor: tone.c,
                                                  color: tone.c,
                                              }
                                            : undefined
                                    }
                                >
                                    <tone.I className="size-3" />
                                    {o.label}
                                </button>
                            );
                        })}
                    </div>
                </OrbitField>

                <OrbitField label="Account">
                    <OrbitSelect
                        value={accountId ?? "__all"}
                        onValueChange={(v) =>
                            setAccountId(v === "__all" ? null : v)
                        }
                        items={[
                            { value: "__all", label: "All accounts" },
                            ...accounts.map((a) => ({
                                value: a.id,
                                label: a.name,
                                leadIcon: <Wallet className="size-3.5" />,
                                leadColor: "var(--ent-1)",
                            })),
                        ]}
                        placeholder="All accounts"
                        leadIcon={<Wallet className="size-3.5" />}
                        leadColor="var(--ent-1)"
                    />
                </OrbitField>

                <OrbitField label="Category">
                    <CategoryTreeSelect
                        categories={categories}
                        value={categoryId}
                        onChange={setCategoryId}
                        placeholder="Any category"
                    />
                </OrbitField>

                {!hideEvents && events.length > 0 && (
                    <OrbitField label="Event">
                        <OrbitSelect
                            value={eventId ?? "__any"}
                            onValueChange={(v) =>
                                setEventId(v === "__any" ? null : v)
                            }
                            items={[
                                { value: "__any", label: "Any event" },
                                ...events.map((e) => ({
                                    value: e.id,
                                    label: e.name,
                                    leadIcon: <CalendarIcon className="size-3.5" />,
                                    leadColor: "var(--ent-5)",
                                })),
                            ]}
                            placeholder="Any event"
                            leadIcon={<CalendarIcon className="size-3.5" />}
                            leadColor="var(--ent-5)"
                        />
                    </OrbitField>
                )}

                <OrbitField label="Amount" hint="Inclusive range">
                    <OrbitFieldRow>
                        <OrbitInput
                            type="number"
                            step="0.01"
                            value={amountMin ?? ""}
                            onChange={(e) => setAmountMin(e.target.value || null)}
                            placeholder="0"
                            prefix="$"
                        />
                        <OrbitInput
                            type="number"
                            step="0.01"
                            value={amountMax ?? ""}
                            onChange={(e) => setAmountMax(e.target.value || null)}
                            placeholder="∞"
                            prefix="$"
                        />
                    </OrbitFieldRow>
                </OrbitField>

                <div className="tx-filter-pop-foot">
                    <button
                        type="button"
                        className="orbit-btn"
                        style={{ flex: 1 }}
                        onClick={() => setOpen(false)}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="orbit-btn orbit-btn-primary"
                        style={{ flex: 1 }}
                        onClick={() => setOpen(false)}
                    >
                        Apply
                        {activeFilterCount > 0 && ` · ${activeFilterCount}`}
                    </button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

const TX_FILTER_POP_STYLES = `
.tx-filter-pop {
    width: 360px;
    background: var(--bg-elev-2) !important;
    border: 1px solid var(--line-strong) !important;
    border-radius: 14px !important;
    box-shadow: 0 24px 60px -16px rgb(0 0 0 / 0.7), 0 1px 0 0 var(--inset-hi) inset !important;
    padding: 16px !important;
    display: flex;
    flex-direction: column;
    gap: 14px;
    color: var(--fg);
    font-family: "Geist", ui-sans-serif, system-ui, sans-serif;
}
.tx-filter-pop-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.tx-filter-pop-eyebrow {
    font-size: 10px;
    color: var(--fg-3);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 500;
}
.tx-filter-pop-types {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.tx-filter-pop-type-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border-radius: 99px;
    background: var(--bg-elev-1);
    border: 1px solid var(--line);
    color: var(--fg-2);
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.tx-filter-pop-type-chip:hover { border-color: var(--line-strong); }

.tx-filter-pop-foot {
    display: flex;
    gap: 8px;
    margin-top: 4px;
}
`;

const TX_STYLES = `
.tx-root {
    margin: -1.5rem -1rem;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
}
@media (min-width: 768px) {
    .tx-root { margin: -2rem; }
}

/* Topbar */
.tx-topbar {
    padding: 26px 32px 18px;
    border-bottom: 1px solid var(--line-soft);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    background: var(--bg);
    flex-wrap: wrap;
}
.tx-topbar-text { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.tx-title {
    font-size: 26px;
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--fg);
    margin: 0;
}
.tx-sub { font-size: 13px; color: var(--fg-3); margin: 0; }
.tx-topbar-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
}
@media (max-width: 720px) {
    .tx-topbar { padding: 18px 18px 14px; }
}

/* Scroll body */
.tx-scroll {
    flex: 1;
    padding: 22px 32px 36px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}
@media (max-width: 720px) {
    .tx-scroll { padding: 16px 18px 28px; }
}

/* Filters */
.orbit-design .od-card.tx-filters {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.tx-filter-row1 {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
}
.tx-search {
    position: relative;
    flex: 1;
    min-width: 240px;
    display: flex;
    align-items: center;
}
.tx-search > svg {
    position: absolute;
    left: 12px;
    pointer-events: none;
    z-index: 1;
    color: var(--fg-4);
}
/* Doubled selector beats .orbit-design .od-input (0,2,0) so the
   left padding actually applies and the icon doesn't overlap text. */
.orbit-design .od-input.tx-search-input {
    flex: 1;
    width: 100%;
    padding-left: 36px;
}
.tx-filter-row2 {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
}
.tx-filter-divider {
    width: 1px;
    height: 18px;
    background: var(--line);
    margin: 0 6px;
}
.tx-filter-count {
    margin-left: auto;
    font-size: 11px;
    color: var(--fg-4);
}
.tx-typebar {
    display: inline-flex;
    align-items: center;
    gap: 2px;
}
.tx-typebar-cell {
    height: 26px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid var(--line-soft);
    background: transparent;
    color: var(--fg-3);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: all 140ms ease;
}
.tx-typebar-cell:hover {
    color: var(--fg-2);
    border-color: var(--line);
}
.tx-typebar-cell.is-active {
    background: var(--bg-elev-3);
    border-color: var(--line-strong);
    color: var(--fg);
}
.tx-active-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    border: 1px solid color-mix(in oklab, var(--brand) 30%, transparent);
    background: var(--brand-soft);
    color: var(--brand);
    cursor: pointer;
    font-family: inherit;
    transition: filter 140ms ease;
}
.tx-active-chip:hover { filter: brightness(1.08); }
.tx-add-filter {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 11px;
    border: 1px dashed var(--line-strong);
    background: transparent;
    color: var(--fg-3);
    cursor: pointer;
    font-family: inherit;
}
.tx-add-filter:hover { color: var(--fg); border-color: var(--brand); }
.tx-filter-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    border-radius: 999px;
    background: var(--brand);
    color: var(--brand-fg);
    font-size: 10px;
    font-weight: 600;
    padding: 0 4px;
}

/* Popover items */
.tx-popover-item {
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
.tx-popover-item:hover { background: var(--bg-elev-2); color: var(--fg); }

/* Period picker popover */
.tx-period-pop {
    width: 320px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.tx-period-section-label {
    font-size: 10px;
    color: var(--fg-4);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 500;
    padding: 0 4px 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.tx-period-active-pill {
    display: inline-flex;
    align-items: center;
    height: 16px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--brand-soft);
    color: var(--brand);
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: none;
}
.tx-period-presets {
    display: flex;
    flex-direction: column;
    gap: 1px;
}
.tx-period-divider {
    height: 1px;
    background: var(--line-soft);
    margin: 2px 0;
}
.tx-period-custom {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.tx-period-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}
.tx-period-input-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}
.tx-period-input-wrap > span {
    font-size: 10.5px;
    color: var(--fg-4);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding-left: 2px;
}
.orbit-design .od-input.tx-period-input {
    height: 36px;
    font-size: 12.5px;
    padding: 0 10px;
    color-scheme: dark;
}
.orbit-design .od-input.tx-period-input::-webkit-calendar-picker-indicator {
    filter: invert(0.85);
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 140ms ease;
}
.orbit-design .od-input.tx-period-input::-webkit-calendar-picker-indicator:hover {
    opacity: 1;
}

/* Daily summary strip */
.orbit-design .od-card.tx-summary {
    padding: 14px 18px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
}
@media (max-width: 720px) {
    .orbit-design .od-card.tx-summary { grid-template-columns: repeat(2, 1fr); }
}
.tx-summary-cell { display: flex; flex-direction: column; gap: 6px; }
.tx-summary-label {
    font-size: 10px;
    color: var(--fg-4);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 500;
}
.tx-summary-amt { line-height: 1; }

/* Table */
.orbit-design .od-card.tx-table-card {
    padding: 0;
    overflow: hidden;
}
.tx-row-grid {
    display: grid;
    grid-template-columns: 110px 130px minmax(0, 1.4fr) minmax(0, 1.2fr) minmax(0, 0.6fr) 100px 130px 60px;
    align-items: center;
}
.tx-table-head {
    padding: 12px 18px;
    border-bottom: 1px solid var(--line);
    background: var(--bg-elev-2);
}
.tx-th {
    font-size: 10.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--fg-4);
    font-weight: 500;
}
.tx-rows-desktop { display: block; }
.tx-rows-mobile { display: none; }
@media (max-width: 900px) {
    .tx-rows-desktop, .tx-table-head { display: none; }
    .tx-rows-mobile { display: block; }
}
.tx-row {
    padding: 13px 18px;
    font-size: 13px;
    transition: background 120ms ease;
    cursor: pointer;
}
.tx-row:hover { background: var(--bg-elev-2); }
.tx-cell-date {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
}
.tx-date { color: var(--fg); font-weight: 500; }
.tx-time {
    font-size: 12px;
    color: var(--fg-3);
    font-family: "Geist Mono", monospace;
    letter-spacing: 0.02em;
}

/* Day partition — quiet eyebrow above each consecutive same-day
   group, with a hairline separating groups. No background, no chip. */
.tx-day-block {
    display: flex;
    flex-direction: column;
}
.tx-day-header {
    padding: 12px 18px 6px;
}
.tx-day-block + .tx-day-block .tx-day-header {
    border-top: 1px solid var(--line-soft);
    padding-top: 14px;
}
.tx-day-label {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 10.5px;
    font-weight: 500;
    color: var(--fg-3);
}
.tx-day-block .tx-row {
    border-bottom: 1px solid var(--line-soft);
}
.tx-day-block .tx-row:last-child {
    border-bottom: 0;
}
@media (max-width: 720px) {
    .tx-day-header { padding: 10px 12px 4px; }
    .tx-day-block + .tx-day-block .tx-day-header { padding-top: 12px; }
}
.tx-cell-flow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--fg-2);
    min-width: 0;
}
.tx-flow-acct {
    text-decoration: none;
    color: inherit;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color 140ms ease;
}
.tx-flow-acct:hover { color: var(--brand); }
.tx-cell-cat {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.tx-event-chip {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid;
    font-size: 11px;
}
.tx-cell-by { display: inline-flex; align-items: center; gap: 6px; }
.tx-cell-amt {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    text-align: right;
}
.tx-cell-desc {
    font-size: 11px;
    color: var(--fg-4);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 130px;
}
.tx-cell-actions {
    display: inline-flex;
    justify-content: flex-end;
    gap: 4px;
}
.tx-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid;
    font-size: 11px;
    font-weight: 500;
}
.tx-empty {
    padding: 60px 18px;
    text-align: center;
    color: var(--fg-3);
    font-size: 13px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
}
.tx-table-foot {
    padding: 14px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-elev-2);
    border-top: 1px solid var(--line-soft);
    flex-wrap: wrap;
    gap: 12px;
}

/* Mobile rows */
.tx-mrow {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border: 0;
    border-bottom: 1px solid var(--line-soft);
    background: transparent;
    width: 100%;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    color: inherit;
}
.tx-mrow:last-child { border-bottom: 0; }
.tx-mrow:hover { background: var(--bg-elev-2); }
.tx-mrow-text { flex: 1; min-width: 0; }
.tx-mrow-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
}
.tx-mrow-date {
    font-size: 11.5px;
    color: var(--fg-3);
    font-variant-numeric: tabular-nums;
}
.tx-mrow-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.tx-mrow-desc {
    font-size: 11px;
    color: var(--fg-4);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Tighter table at <1280 — drop event + by columns */
@media (max-width: 1280px) and (min-width: 901px) {
    .tx-row-grid {
        grid-template-columns: 100px 120px minmax(0, 1.4fr) minmax(0, 1.2fr) 130px 60px;
    }
    .tx-row-grid > :nth-child(5),
    .tx-row-grid > :nth-child(6) { display: none; }
}

/* Phone (<640px) — tighten filters, search, summary tiles. */
@media (max-width: 640px) {
    .tx-topbar { padding: 14px 14px 10px; }
    .tx-title { font-size: 22px; }
    .tx-scroll { padding: 12px 14px 22px; gap: 12px; }
    .tx-search { min-width: 0; width: 100%; flex: 1 1 100%; }
    .tx-filter-row1 { gap: 8px; }
    .tx-filter-count { margin-left: 0; flex: 1 1 100%; text-align: right; }
    .orbit-design .od-card.tx-summary {
        grid-template-columns: 1fr 1fr;
        padding: 12px 14px;
        gap: 12px;
    }
    .tx-mrow { padding: 10px 12px; gap: 10px; }
    .tx-table-foot { padding: 12px; gap: 10px; }
    .tx-period-pop { width: min(320px, calc(100vw - 2rem)); }
}

@media (max-width: 380px) {
    .orbit-design .od-card.tx-summary { grid-template-columns: 1fr; }
}
`;
