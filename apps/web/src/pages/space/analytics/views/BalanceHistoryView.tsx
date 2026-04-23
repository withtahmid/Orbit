import { useMemo, useState } from "react";
import { ChevronDown, Wallet } from "lucide-react";
import { formatInAppTz } from "@/lib/formatDate";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip as RTooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";

export default function BalanceHistoryView() {
    const { space } = useCurrentSpace();
    const { period } = usePeriod("last-3-months");

    // Accounts available to filter on. For a real space that's every
    // account in the space; for the virtual personal space it's every
    // account the caller owns (the scope the personal balance_history
    // already operates within — filtering to a non-owned account would
    // be silently dropped server-side anyway).
    const accountsSpace = trpc.account.listBySpace.useQuery(
        { spaceId: space.id },
        { enabled: !space.isPersonal }
    );
    const accountsPersonal = trpc.personal.ownedAccounts.useQuery(undefined, {
        enabled: space.isPersonal,
    });
    const accounts = useMemo(() => {
        if (space.isPersonal) {
            return (accountsPersonal.data ?? []).map((a) => ({
                id: a.id,
                name: a.name,
                color: a.color,
                icon: a.icon,
            }));
        }
        return (accountsSpace.data ?? []).map((a) => ({
            id: a.id,
            name: a.name,
            color: a.color,
            icon: a.icon,
        }));
    }, [space.isPersonal, accountsSpace.data, accountsPersonal.data]);

    // Empty set = "all accounts" (no filter). Using a Set here rather
    // than an array so toggle is O(1) and order-independent.
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const hasFilter = selected.size > 0;
    const accountIds = hasFilter ? Array.from(selected) : undefined;

    const qSpace = trpc.analytics.balanceHistory.useQuery(
        {
            spaceId: space.id,
            periodStart: period.start,
            periodEnd: period.end,
            bucket: "day",
            accountIds,
        },
        { enabled: !space.isPersonal }
    );
    const qPersonal = trpc.personal.balanceHistory.useQuery(
        {
            periodStart: period.start,
            periodEnd: period.end,
            bucket: "day",
            accountIds,
        },
        { enabled: space.isPersonal }
    );
    const q = space.isPersonal ? qPersonal : qSpace;

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const triggerLabel = hasFilter
        ? selected.size === 1
            ? accounts.find((a) => selected.has(a.id))?.name ?? "1 account"
            : `${selected.size} accounts`
        : "All accounts";

    return (
        <AnalyticsDetailLayout
            title="Balance history"
            description="Total space balance (assets minus liabilities) over time."
            actions={
                <div className="flex flex-wrap items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className="justify-between gap-2"
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    <Wallet className="size-3.5" />
                                    {triggerLabel}
                                </span>
                                <ChevronDown className="size-3.5 opacity-60" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                            <DropdownMenuLabel>Filter by account</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {accounts.length === 0 ? (
                                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                    No accounts available.
                                </p>
                            ) : (
                                <>
                                    <DropdownMenuItem
                                        onSelect={(e) => {
                                            e.preventDefault();
                                            setSelected(new Set());
                                        }}
                                        disabled={!hasFilter}
                                    >
                                        Clear selection
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <div className="max-h-[260px] overflow-y-auto">
                                        {accounts.map((a) => (
                                            <DropdownMenuCheckboxItem
                                                key={a.id}
                                                checked={selected.has(a.id)}
                                                onCheckedChange={() => toggle(a.id)}
                                                onSelect={(e) => e.preventDefault()}
                                            >
                                                <span className="flex min-w-0 items-center gap-2">
                                                    <EntityAvatar
                                                        size="sm"
                                                        color={a.color}
                                                        icon={a.icon}
                                                    />
                                                    <span className="truncate">
                                                        {a.name}
                                                    </span>
                                                </span>
                                            </DropdownMenuCheckboxItem>
                                        ))}
                                    </div>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <PeriodSelector defaultPreset="last-3-months" />
                </div>
            }
        >
            <Card>
                <CardHeader>
                    <CardTitle>Balance over the selected period</CardTitle>
                </CardHeader>
                <CardContent className="h-[340px] px-1 sm:h-[420px] sm:px-6">
                    {q.isLoading ? (
                        <Skeleton className="h-full w-full" />
                    ) : (q.data ?? []).length === 0 ? (
                        <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                            No balance data yet.
                        </p>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={q.data ?? []}>
                                <defs>
                                    <linearGradient
                                        id="balance-detail-grad"
                                        x1="0"
                                        y1="0"
                                        x2="0"
                                        y2="1"
                                    >
                                        <stop
                                            offset="0%"
                                            stopColor="var(--primary)"
                                            stopOpacity={0.45}
                                        />
                                        <stop
                                            offset="100%"
                                            stopColor="var(--primary)"
                                            stopOpacity={0}
                                        />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                <XAxis
                                    dataKey="bucket"
                                    tickFormatter={(v) => formatInAppTz(v, "MMM d")}
                                    stroke="var(--muted-foreground)"
                                    fontSize={11}
                                />
                                <YAxis
                                    stroke="var(--muted-foreground)"
                                    fontSize={11}
                                    width={60}
                                />
                                <RTooltip
                                    contentStyle={{
                                        background: "var(--popover)",
                                        border: "1px solid var(--border)",
                                        borderRadius: 8,
                                    }}
                                    labelFormatter={(v) =>
                                        formatInAppTz(v as any, "MMM d, yyyy")
                                    }
                                />
                                <Area
                                    type="monotone"
                                    dataKey="balance"
                                    stroke="var(--primary)"
                                    strokeWidth={2}
                                    fill="url(#balance-detail-grad)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>
        </AnalyticsDetailLayout>
    );
}
