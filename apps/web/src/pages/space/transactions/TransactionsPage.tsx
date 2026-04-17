import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import {
    ArrowLeftRight,
    Filter,
    Loader2,
    Search,
    Trash2,
    X,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/shared/EmptyState";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { TransactionTypeBadge } from "@/components/shared/TransactionTypeBadge";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { CategoryTreeSelect } from "@/components/shared/CategoryTreeSelect";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { NewTransactionSheet } from "@/features/transactions/NewTransactionSheet";
import { ROUTES } from "@/router/routes";
import { useStore } from "@/stores/useStore";
import { colorTint } from "@/lib/entityStyle";
import { cn } from "@/lib/utils";

type TxType = "income" | "expense" | "transfer" | "adjustment";

export default function TransactionsPage() {
    const { space } = useCurrentSpace();
    const { authStore } = useStore();
    const { period } = usePeriod("this-month");

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

    const accountsQuery = trpc.account.listBySpace.useQuery({ spaceId: space.id });
    const categoriesQuery = trpc.expenseCategory.listBySpace.useQuery({
        spaceId: space.id,
    });
    const eventsQuery = trpc.event.listBySpace.useQuery({ spaceId: space.id });
    const membersQuery = trpc.space.memberList.useQuery({ spaceId: space.id });

    const [pageCursors, setPageCursors] = useState<(string | null)[]>([null]);
    const cursor = pageCursors[pageCursors.length - 1];

    const listQuery = trpc.transaction.listBySpace.useQuery({
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
    });

    const accountsById = useMemo(() => {
        const m = new Map<string, { name: string; color: string; icon: string }>();
        for (const a of accountsQuery.data ?? [])
            m.set(a.id, { name: a.name, color: a.color, icon: a.icon });
        return m;
    }, [accountsQuery.data]);

    const categoriesById = useMemo(() => {
        const m = new Map<string, { name: string; color: string; icon: string }>();
        for (const c of categoriesQuery.data ?? [])
            m.set(c.id, { name: c.name, color: c.color, icon: c.icon });
        return m;
    }, [categoriesQuery.data]);

    const eventsById = useMemo(() => {
        const m = new Map<string, { name: string; color: string; icon: string }>();
        for (const ev of eventsQuery.data ?? [])
            m.set(ev.id, { name: ev.name, color: ev.color, icon: ev.icon });
        return m;
    }, [eventsQuery.data]);

    const utils = trpc.useUtils();
    const del = trpc.transaction.delete.useMutation({
        onSuccess: async () => {
            toast.success("Transaction deleted");
            await utils.transaction.listBySpace.invalidate({ spaceId: space.id });
            await utils.account.listBySpace.invalidate({ spaceId: space.id });
            await utils.analytics.spaceSummary.invalidate();
            await utils.analytics.envelopeUtilization.invalidate({ spaceId: space.id });
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

    const resetFilters = () => {
        setParams(
            (p) => {
                const next = new URLSearchParams();
                // keep period if present
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

    return (
        <div className="grid gap-5 sm:gap-6">
            <PageHeader
                title="Transactions"
                description="All money movement in this space"
                actions={
                    <PermissionGate roles={["owner", "editor"]}>
                        <NewTransactionSheet />
                    </PermissionGate>
                }
            />

            {/* Filter bar */}
            <Card className="p-3 sm:p-4">
                <div className="grid gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[12rem]">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={searchRaw}
                                onChange={(e) => setParam("q", e.target.value)}
                                placeholder="Search description or location"
                                className="pl-8"
                            />
                        </div>
                        <PeriodSelector />
                        <MobileFilters
                            type={type}
                            setType={(v) => setParam("type", v)}
                            accountId={accountId}
                            setAccountId={(v) => setParam("account", v)}
                            categoryId={categoryId}
                            setCategoryId={(v) => setParam("category", v)}
                            eventId={eventId}
                            setEventId={(v) => setParam("event", v)}
                            userId={userId}
                            setUserId={(v) => setParam("user", v)}
                            amountMin={amountMin}
                            setAmountMin={(v) => setParam("min", v)}
                            amountMax={amountMax}
                            setAmountMax={(v) => setParam("max", v)}
                            accounts={accountsQuery.data ?? []}
                            categories={(categoriesQuery.data ?? []) as any}
                            events={eventsQuery.data ?? []}
                            members={membersQuery.data ?? []}
                            activeFilterCount={activeFilterCount}
                        />
                        {activeFilterCount > 0 && (
                            <Button size="sm" variant="ghost" onClick={resetFilters}>
                                <X className="size-3.5" />
                                Clear
                            </Button>
                        )}
                    </div>
                    {/* Desktop inline filters */}
                    <div className="hidden flex-wrap items-center gap-2 md:flex">
                        <TypeFilter value={type} onChange={(v) => setParam("type", v)} />
                        <Select
                            value={accountId ?? "all"}
                            onValueChange={(v) => setParam("account", v === "all" ? null : v)}
                        >
                            <SelectTrigger className="w-44">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All accounts</SelectItem>
                                {(accountsQuery.data ?? []).map((a) => (
                                    <SelectItem key={a.id} value={a.id}>
                                        {a.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="w-56">
                            <CategoryTreeSelect
                                categories={(categoriesQuery.data ?? []) as any}
                                value={categoryId}
                                onChange={(id) => setParam("category", id)}
                                placeholder="Any category"
                            />
                        </div>
                        <Select
                            value={eventId ?? "all"}
                            onValueChange={(v) => setParam("event", v === "all" ? null : v)}
                        >
                            <SelectTrigger className="w-44">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any event</SelectItem>
                                {(eventsQuery.data ?? []).map((e) => (
                                    <SelectItem key={e.id} value={e.id}>
                                        {e.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </Card>

            {/* Results */}
            <Card className="p-0">
                {listQuery.isLoading ? (
                    <div className="flex items-center justify-center p-10">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                ) : !listQuery.data || listQuery.data.items.length === 0 ? (
                    <EmptyState
                        icon={ArrowLeftRight}
                        title="No transactions match"
                        description={
                            activeFilterCount > 0
                                ? "Try clearing some filters."
                                : "Create an income, expense, or transfer to get started."
                        }
                        action={
                            activeFilterCount === 0 ? (
                                <PermissionGate roles={["owner", "editor"]}>
                                    <NewTransactionSheet />
                                </PermissionGate>
                            ) : null
                        }
                    />
                ) : (
                    <>
                        {/* Desktop table */}
                        <div className="hidden md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>From / To</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Event</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead className="w-10" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {listQuery.data.items.map((t) => {
                                        const tType = t.type as unknown as TxType;
                                        const variant =
                                            tType === "income"
                                                ? "income"
                                                : tType === "expense"
                                                  ? "expense"
                                                  : "transfer";
                                        const cat = t.expense_category_id
                                            ? categoriesById.get(t.expense_category_id)
                                            : null;
                                        const ev = t.event_id
                                            ? eventsById.get(t.event_id)
                                            : null;
                                        const canDelete =
                                            t.created_by === authStore.user?.id;
                                        return (
                                            <TableRow key={t.id}>
                                                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                                    {format(
                                                        new Date(t.transaction_datetime),
                                                        "MMM d, HH:mm"
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <TransactionTypeBadge type={tType} />
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    <AccountFlow
                                                        spaceId={space.id}
                                                        from={t.source_account_id}
                                                        to={t.destination_account_id}
                                                        accountsById={accountsById}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {cat ? (
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <EntityAvatar
                                                                size="sm"
                                                                color={cat.color}
                                                                icon={cat.icon}
                                                            />
                                                            <span className="truncate">
                                                                {cat.name}
                                                            </span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground">
                                                            —
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {ev ? (
                                                        <span
                                                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                                                            style={{
                                                                backgroundColor: colorTint(
                                                                    ev.color,
                                                                    0.15
                                                                ),
                                                                color: ev.color,
                                                            }}
                                                        >
                                                            {ev.name}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground">
                                                            —
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground max-w-64 truncate">
                                                    {t.description ?? ""}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <MoneyDisplay
                                                        amount={t.amount}
                                                        variant={variant as any}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    {canDelete && (
                                                        <ConfirmDialog
                                                            trigger={
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    className="size-7"
                                                                >
                                                                    <Trash2 className="size-3.5 text-destructive" />
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
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Mobile list */}
                        <div className="divide-y divide-border md:hidden">
                            {listQuery.data.items.map((t) => {
                                const tType = t.type as unknown as TxType;
                                const variant =
                                    tType === "income"
                                        ? "income"
                                        : tType === "expense"
                                          ? "expense"
                                          : "transfer";
                                const cat = t.expense_category_id
                                    ? categoriesById.get(t.expense_category_id)
                                    : null;
                                const canDelete = t.created_by === authStore.user?.id;
                                return (
                                    <div key={t.id} className="flex items-start gap-3 p-3">
                                        {cat ? (
                                            <EntityAvatar
                                                color={cat.color}
                                                icon={cat.icon}
                                                size="md"
                                            />
                                        ) : (
                                            <EntityAvatar
                                                color="#64748b"
                                                icon="banknote"
                                                size="md"
                                            />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <TransactionTypeBadge type={tType} />
                                                <span className="text-xs text-muted-foreground">
                                                    {format(
                                                        new Date(t.transaction_datetime),
                                                        "MMM d"
                                                    )}
                                                </span>
                                            </div>
                                            <p className="mt-1 truncate text-sm font-medium">
                                                {cat?.name ?? "—"}
                                            </p>
                                            {t.description && (
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {t.description}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <MoneyDisplay
                                                amount={t.amount}
                                                variant={variant as any}
                                            />
                                            {canDelete && (
                                                <ConfirmDialog
                                                    trigger={
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="size-6"
                                                        >
                                                            <Trash2 className="size-3 text-destructive" />
                                                        </Button>
                                                    }
                                                    title="Delete transaction?"
                                                    confirmLabel="Delete"
                                                    destructive
                                                    onConfirm={() =>
                                                        del.mutate({
                                                            transactionId: t.id,
                                                        })
                                                    }
                                                />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex items-center justify-between border-t border-border p-3">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={pageCursors.length <= 1}
                                onClick={() => setPageCursors((p) => p.slice(0, -1))}
                            >
                                Previous
                            </Button>
                            <span className="text-xs text-muted-foreground">
                                Page {pageCursors.length}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!listQuery.data?.nextCursor}
                                onClick={() =>
                                    setPageCursors((p) => [
                                        ...p,
                                        listQuery.data!.nextCursor!,
                                    ])
                                }
                            >
                                Next
                            </Button>
                        </div>
                    </>
                )}
            </Card>
        </div>
    );
}

function TypeFilter({
    value,
    onChange,
}: {
    value: TxType | null;
    onChange: (v: string | null) => void;
}) {
    const options: Array<{ value: TxType | null; label: string }> = [
        { value: null, label: "All" },
        { value: "income", label: "Income" },
        { value: "expense", label: "Expense" },
        { value: "transfer", label: "Transfer" },
        { value: "adjustment", label: "Adjustment" },
    ];
    return (
        <div className="flex gap-1 rounded-md border border-border p-0.5">
            {options.map((o) => (
                <button
                    key={String(o.value)}
                    type="button"
                    onClick={() => onChange(o.value)}
                    className={cn(
                        "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                        value === o.value
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function MobileFilters({
    type,
    setType,
    accountId,
    setAccountId,
    categoryId,
    setCategoryId,
    eventId,
    setEventId,
    userId,
    setUserId,
    amountMin,
    setAmountMin,
    amountMax,
    setAmountMax,
    accounts,
    categories,
    events,
    members,
    activeFilterCount,
}: {
    type: TxType | null;
    setType: (v: string | null) => void;
    accountId: string | null;
    setAccountId: (v: string | null) => void;
    categoryId: string | null;
    setCategoryId: (v: string | null) => void;
    eventId: string | null;
    setEventId: (v: string | null) => void;
    userId: string | null;
    setUserId: (v: string | null) => void;
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
    members: Array<{ id: string; first_name: string; last_name: string }>;
    activeFilterCount: number;
}) {
    const [open, setOpen] = useState(false);
    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="md:hidden">
                    <Filter className="size-4" />
                    Filters
                    {activeFilterCount > 0 && (
                        <span className="ml-1 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                            {activeFilterCount}
                        </span>
                    )}
                </Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex flex-col gap-4 p-5">
                <SheetHeader className="p-0">
                    <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="grid gap-3 overflow-y-auto">
                    <div className="grid gap-1.5">
                        <Label>Type</Label>
                        <TypeFilter value={type} onChange={setType} />
                    </div>
                    <div className="grid gap-1.5">
                        <Label>Account</Label>
                        <Select
                            value={accountId ?? "all"}
                            onValueChange={(v) => setAccountId(v === "all" ? null : v)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All accounts</SelectItem>
                                {accounts.map((a) => (
                                    <SelectItem key={a.id} value={a.id}>
                                        {a.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-1.5">
                        <Label>Category</Label>
                        <CategoryTreeSelect
                            categories={categories}
                            value={categoryId}
                            onChange={setCategoryId}
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label>Event</Label>
                        <Select
                            value={eventId ?? "all"}
                            onValueChange={(v) => setEventId(v === "all" ? null : v)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any event</SelectItem>
                                {events.map((e) => (
                                    <SelectItem key={e.id} value={e.id}>
                                        {e.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-1.5">
                        <Label>Created by</Label>
                        <Select
                            value={userId ?? "all"}
                            onValueChange={(v) => setUserId(v === "all" ? null : v)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Anyone</SelectItem>
                                {members.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                        {m.first_name} {m.last_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label>Min amount</Label>
                            <Input
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                value={amountMin ?? ""}
                                onChange={(e) =>
                                    setAmountMin(e.target.value || null)
                                }
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Max amount</Label>
                            <Input
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                value={amountMax ?? ""}
                                onChange={(e) =>
                                    setAmountMax(e.target.value || null)
                                }
                            />
                        </div>
                    </div>
                </div>
                <Button onClick={() => setOpen(false)} variant="gradient">
                    Apply
                </Button>
            </SheetContent>
        </Sheet>
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
    const renderRef = (id: string | null) =>
        id ? (
            <Link
                to={ROUTES.spaceAccountDetail(spaceId, id)}
                className="inline-flex items-center gap-1 hover:text-primary"
            >
                <EntityAvatar
                    size="sm"
                    color={accountsById.get(id)?.color ?? "#64748b"}
                    icon={accountsById.get(id)?.icon ?? "wallet"}
                />
                <span className="truncate max-w-[8rem]">
                    {accountsById.get(id)?.name ?? "Account"}
                </span>
            </Link>
        ) : (
            <span className="text-muted-foreground">—</span>
        );

    return (
        <span className="flex items-center gap-2">
            {renderRef(from)}
            <span className="text-muted-foreground">→</span>
            {renderRef(to)}
        </span>
    );
}
