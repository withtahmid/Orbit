import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { KpiStrip, type KpiItem } from "@/components/shared/KpiStrip";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { cn } from "@/lib/utils";

/**
 * Allocation map — three perspectives on the same envelope×account×plan
 * partition.
 *
 *   1. By envelope — for each envelope, which accounts fund it (stacked bar)
 *   2. By account  — for the selected account, which envelopes / plans it
 *                    funds (account-pill picker + bars + balance KPIs)
 *   3. Totals      — space-wide partition of every dollar (KPIs + sankey-ish bar)
 */
export default function AllocationsView() {
    const { space } = useCurrentSpace();

    if (space.isPersonal) {
        return (
            <AnalyticsDetailLayout
                title="Allocation map"
                description="Where money is partitioned across envelopes and accounts."
            >
                <Card>
                    <CardContent className="py-12 text-center text-sm text-muted-foreground">
                        Allocation map is a per-space view. Open a real space
                        to see it.
                    </CardContent>
                </Card>
            </AnalyticsDetailLayout>
        );
    }

    return (
        <AnalyticsDetailLayout
            title="Allocation map"
            description="Where money is partitioned. Each envelope and plan is funded from one or more accounts — this view shows the contribution shape."
        >
            <Tabs defaultValue="by-envelope">
                <TabsList>
                    <TabsTrigger value="by-envelope">By envelope</TabsTrigger>
                    <TabsTrigger value="by-account">By account</TabsTrigger>
                    <TabsTrigger value="totals">Totals</TabsTrigger>
                </TabsList>
                <TabsContent value="by-envelope" className="mt-4">
                    <ByEnvelopePanel spaceId={space.id} />
                </TabsContent>
                <TabsContent value="by-account" className="mt-4">
                    <ByAccountPanel spaceId={space.id} />
                </TabsContent>
                <TabsContent value="totals" className="mt-4">
                    <TotalsPanel spaceId={space.id} />
                </TabsContent>
            </Tabs>
        </AnalyticsDetailLayout>
    );
}

const UNASSIGNED_COLOR = "#64748b";

/**
 * Shared data hook — single tRPC fetch per panel mount; the three panels
 * read from the cache because react-query dedupes identical inputs.
 */
function useAllocations(spaceId: string) {
    return trpc.analytics.allocations.useQuery({ spaceId });
}

/* ============================================================
   1. BY ENVELOPE — stacked bars per envelope, account = color
   ============================================================ */
function ByEnvelopePanel({ spaceId }: { spaceId: string }) {
    const q = useAllocations(spaceId);

    const rows = useMemo(() => {
        if (!q.data) return [];
        const acctById = new Map(q.data.accounts.map((a) => [a.id, a]));
        const cellsByEnv = new Map<
            string,
            Array<{ id: string; name: string; color: string; value: number }>
        >();
        for (const cell of q.data.matrix) {
            if (cell.amount <= 0) continue;
            const arr = cellsByEnv.get(cell.envelopId) ?? [];
            if (cell.accountId == null) {
                arr.push({
                    id: "unassigned",
                    name: "Unassigned",
                    color: UNASSIGNED_COLOR,
                    value: cell.amount,
                });
            } else {
                const a = acctById.get(cell.accountId);
                if (!a) continue;
                arr.push({
                    id: a.id,
                    name: a.name,
                    color: a.color,
                    value: cell.amount,
                });
            }
            cellsByEnv.set(cell.envelopId, arr);
        }
        return q.data.envelopes
            .map((e) => {
                const segments = cellsByEnv.get(e.id) ?? [];
                const total = segments.reduce((s, x) => s + x.value, 0);
                return { id: e.id, name: e.name, total, segments };
            })
            .filter((r) => r.total > 0);
    }, [q.data]);

    const max = Math.max(0, ...rows.map((r) => r.total));

    const legend = useMemo(() => {
        const seen = new Map<string, { id: string; name: string; color: string }>();
        for (const r of rows) {
            for (const seg of r.segments) {
                if (!seen.has(seg.id)) {
                    seen.set(seg.id, { id: seg.id, name: seg.name, color: seg.color });
                }
            }
        }
        return Array.from(seen.values());
    }, [rows]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Which accounts fund each envelope</CardTitle>
                <p className="text-xs text-muted-foreground">
                    Each bar is one envelope; segments are the contributing accounts.
                    Width = total allocated.
                </p>
            </CardHeader>
            <CardContent className="grid gap-5">
                {q.isLoading ? (
                    <Skeleton className="h-48 w-full" />
                ) : rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No envelope allocations yet. Allocate funds from any
                        envelope to populate this view.
                    </p>
                ) : (
                    <>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                            {legend.map((l) => (
                                <span
                                    key={l.id}
                                    className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
                                >
                                    <span
                                        className="size-2 rounded-sm"
                                        style={{ backgroundColor: l.color }}
                                    />
                                    {l.name}
                                </span>
                            ))}
                        </div>

                        <div className="flex flex-col gap-2.5">
                            {rows.map((r) => (
                                <div
                                    key={r.id}
                                    className="grid items-center gap-3 sm:gap-4"
                                    style={{
                                        gridTemplateColumns:
                                            "minmax(120px, 200px) minmax(0, 1fr) 96px",
                                    }}
                                >
                                    <span className="truncate text-[12.5px] text-foreground/90">
                                        {r.name}
                                    </span>
                                    <span
                                        className="flex h-3.5 overflow-hidden rounded"
                                        style={{
                                            width:
                                                max > 0
                                                    ? `${(r.total / max) * 100}%`
                                                    : "0%",
                                        }}
                                    >
                                        {r.segments.map((s) => (
                                            <span
                                                key={s.id}
                                                title={`${s.name}: $${s.value.toLocaleString(
                                                    "en-US",
                                                    {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    }
                                                )}`}
                                                style={{
                                                    flex: s.value,
                                                    backgroundColor: s.color,
                                                }}
                                            />
                                        ))}
                                    </span>
                                    <MoneyDisplay
                                        amount={r.total}
                                        variant="neutral"
                                        className="text-right text-[12.5px] font-semibold"
                                    />
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}

/* ============================================================
   2. BY ACCOUNT — pill picker, balance KPIs, envelope/plan rows
   ============================================================ */
function ByAccountPanel({ spaceId }: { spaceId: string }) {
    const q = useAllocations(spaceId);
    const planAllocsQ = trpc.plan.allocationListBySpace.useQuery({ spaceId });
    const plansQ = trpc.analytics.planProgress.useQuery({ spaceId });

    const accounts = q.data?.accounts ?? [];
    const pickable = accounts.filter((a) => a.accountType !== "locked");
    const [selectedId, setSelectedId] = useState<string>("");
    const effectiveId = selectedId || pickable[0]?.id || "";

    const data = useMemo(() => {
        if (!q.data || !effectiveId)
            return null;
        const acct = q.data.accounts.find((a) => a.id === effectiveId);
        if (!acct) return null;

        const envelopes = q.data.envelopes
            .map((e) => {
                const cell = q.data.matrix.find(
                    (c) => c.envelopId === e.id && c.accountId === effectiveId
                );
                const allocated = cell?.amount ?? 0;
                const totalAlloc = e.allocated;
                const spent =
                    totalAlloc > 0
                        ? (e.consumed * allocated) / totalAlloc
                        : 0;
                return {
                    env: { id: e.id, name: e.name, color: e.color },
                    allocated,
                    spent,
                };
            })
            .filter((e) => e.allocated > 0 || e.spent > 0);

        const planRows = (planAllocsQ.data ?? [])
            .filter((p) => p.account_id === effectiveId)
            .map((p) => {
                const plan = (plansQ.data ?? []).find(
                    (pp) => pp.planId === p.plan_id
                );
                return {
                    id: p.id,
                    name: plan?.name ?? "Plan",
                    color: plan?.color ?? "#a855f7",
                    allocated: Number(p.amount),
                };
            });

        const earmarkedEnv = envelopes.reduce(
            (s, e) => s + Math.max(0, e.allocated - e.spent),
            0
        );
        const earmarkedPlan = planRows.reduce(
            (s, p) => s + p.allocated,
            0
        );
        const earmarked = earmarkedEnv + earmarkedPlan;
        const unallocated = acct.balance - earmarked;
        return {
            acct,
            envelopes,
            plans: planRows,
            earmarked,
            unallocated,
        };
    }, [q.data, effectiveId, planAllocsQ.data, plansQ.data]);

    if (q.isLoading) {
        return <Skeleton className="h-64 w-full" />;
    }
    if (!data) {
        return (
            <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                    No accounts available in this space.
                </CardContent>
            </Card>
        );
    }

    const envMax = Math.max(
        0,
        ...data.envelopes.map((e) => e.allocated + e.spent)
    );
    const planMax = Math.max(0, ...data.plans.map((p) => p.allocated));

    return (
        <div className="grid gap-4">
            <Card>
                <CardHeader>
                    <CardTitle>Pick an account</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        See where its balance is partitioned.
                    </p>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-2">
                        {pickable.map((a) => {
                            const active = a.id === effectiveId;
                            return (
                                <button
                                    key={a.id}
                                    type="button"
                                    onClick={() => setSelectedId(a.id)}
                                    className={cn(
                                        "inline-flex h-8 items-center gap-2 rounded-full border px-3.5 text-[12px] transition-colors",
                                        active
                                            ? "border-foreground/30 bg-accent text-foreground"
                                            : "border-border bg-card text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <span
                                        className="size-1.5 rounded-full"
                                        style={{ backgroundColor: a.color }}
                                    />
                                    {a.name}
                                </button>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <div>
                        <CardTitle>{data.acct.name} — balance breakdown</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                            What this account is funding right now.
                        </p>
                    </div>
                </CardHeader>
                <CardContent>
                    <KpiStrip
                        items={[
                            {
                                label: "Balance",
                                value: data.acct.balance,
                                money: true,
                            },
                            {
                                label: "Earmarked",
                                value: data.earmarked,
                                money: true,
                            },
                            {
                                label: "Unallocated",
                                value: data.unallocated,
                                money: true,
                                tone: data.unallocated < 0 ? "expense" : "neutral",
                            },
                        ]}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Envelopes funded from {data.acct.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Solid = remaining; dim = spent this period.
                    </p>
                </CardHeader>
                <CardContent>
                    {data.envelopes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No envelope activity at this account.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-2.5">
                            {data.envelopes.map((e) => {
                                const total = e.allocated + e.spent;
                                const remaining = Math.max(
                                    0,
                                    e.allocated - e.spent
                                );
                                const spent = e.spent;
                                return (
                                    <div
                                        key={e.env.id}
                                        className="grid items-center gap-3 sm:gap-4"
                                        style={{
                                            gridTemplateColumns:
                                                "minmax(140px, 200px) minmax(0, 1fr) 96px",
                                        }}
                                    >
                                        <span className="flex min-w-0 items-center gap-2 truncate text-[12.5px] text-foreground/90">
                                            <span
                                                className="size-1.5 shrink-0 rounded-full"
                                                style={{
                                                    backgroundColor: e.env.color,
                                                }}
                                            />
                                            <span className="truncate">
                                                {e.env.name}
                                            </span>
                                        </span>
                                        <span
                                            className="flex h-1.5 overflow-hidden rounded-full bg-muted/40"
                                            style={{
                                                width:
                                                    envMax > 0
                                                        ? `${(total / envMax) * 100}%`
                                                        : "0%",
                                            }}
                                        >
                                            <span
                                                style={{
                                                    flex: remaining,
                                                    backgroundColor: e.env.color,
                                                }}
                                            />
                                            <span
                                                style={{
                                                    flex: spent,
                                                    backgroundColor: e.env.color,
                                                    opacity: 0.35,
                                                }}
                                            />
                                        </span>
                                        <MoneyDisplay
                                            amount={total}
                                            variant="neutral"
                                            className="text-right text-[12.5px] font-semibold"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Plans funded from {data.acct.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Long-horizon goals.
                    </p>
                </CardHeader>
                <CardContent>
                    {data.plans.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No plan allocations from this account.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-2.5">
                            {data.plans.map((p) => (
                                <div
                                    key={p.id}
                                    className="grid items-center gap-3 sm:gap-4"
                                    style={{
                                        gridTemplateColumns:
                                            "minmax(140px, 200px) minmax(0, 1fr) 96px",
                                    }}
                                >
                                    <span className="flex min-w-0 items-center gap-2 truncate text-[12.5px] text-foreground/90">
                                        <Target
                                            className="size-3 shrink-0"
                                            style={{ color: p.color }}
                                        />
                                        <span className="truncate">{p.name}</span>
                                    </span>
                                    <span
                                        className="block h-1.5 overflow-hidden rounded-full bg-muted/40"
                                        style={{
                                            width:
                                                planMax > 0
                                                    ? `${(p.allocated / planMax) * 100}%`
                                                    : "0%",
                                        }}
                                    >
                                        <span
                                            className="block h-full rounded-full"
                                            style={{ backgroundColor: p.color }}
                                        />
                                    </span>
                                    <MoneyDisplay
                                        amount={p.allocated}
                                        variant="neutral"
                                        className="text-right text-[12.5px] font-semibold"
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

/* ============================================================
   3. TOTALS — KPI strip + sankey-ish partition bar
   ============================================================ */
function TotalsPanel({ spaceId }: { spaceId: string }) {
    const q = useAllocations(spaceId);
    const planAllocsQ = trpc.plan.allocationListBySpace.useQuery({ spaceId });

    const t = useMemo(() => {
        if (!q.data) {
            return {
                totalAssets: 0,
                liabilities: 0,
                locked: 0,
                earmarked: 0,
                unallocated: 0,
                drift: 0,
                partition: [] as Array<{
                    label: string;
                    value: number;
                    color: string;
                }>,
            };
        }
        const totalAssets = q.data.accounts
            .filter((a) => a.accountType === "asset")
            .reduce((s, a) => s + a.balance, 0);
        const liabilities = q.data.accounts
            .filter((a) => a.accountType === "liability")
            .reduce((s, a) => s + a.balance, 0);
        const locked = q.data.accounts
            .filter((a) => a.accountType === "locked")
            .reduce((s, a) => s + a.balance, 0);
        const earmarkedEnv = q.data.envelopes.reduce(
            (s, e) => s + e.allocated,
            0
        );
        const earmarkedPlans = (planAllocsQ.data ?? []).reduce(
            (s, p) => s + Number(p.amount),
            0
        );
        const earmarked = earmarkedEnv + earmarkedPlans;
        const unallocated = Math.max(0, totalAssets - earmarked);
        const drift = q.data.drift.delta;
        return {
            totalAssets,
            liabilities,
            locked,
            earmarked,
            unallocated,
            drift,
            partition: [
                {
                    label: "Plans",
                    value: earmarkedPlans,
                    color: "#a855f7",
                },
                {
                    label: "Locked savings",
                    value: locked,
                    color: "#3b82f6",
                },
                {
                    label: "Free",
                    value: unallocated,
                    color: "#10b981",
                },
                {
                    label: "Liabilities",
                    value: liabilities,
                    color: "#ef4444",
                },
            ].filter((p) => p.value > 0),
        };
    }, [q.data, planAllocsQ.data]);

    const partitionTotal = t.partition.reduce((s, p) => s + p.value, 0);

    const kpiItems: KpiItem[] = [
        {
            label: "Total assets",
            value: t.totalAssets,
            money: true,
            tone: "income",
        },
        {
            label: "Earmarked",
            value: t.earmarked,
            money: true,
            sub: "Across envelopes + plans",
        },
        {
            label: "Unallocated",
            value: t.unallocated,
            money: true,
            tone: t.unallocated < 0 ? "expense" : "neutral",
            sub: "Free-floating",
        },
        {
            label: "Drift (legacy)",
            value: t.drift,
            money: true,
            tone: t.drift < 0 ? "expense" : "neutral",
            sub: "Assets − envelopes",
        },
    ];

    return (
        <div className="grid gap-4">
            <div
                className="rounded-lg border px-4 py-3 text-[12.5px]"
                style={{
                    borderColor: "color-mix(in oklab, var(--brand) 28%, var(--border))",
                    background: "color-mix(in oklab, var(--brand) 5%, var(--card))",
                    color: "var(--fg-2)",
                }}
            >
                <strong style={{ color: "var(--fg)" }}>Reporting view.</strong>{" "}
                Envelopes are now space-wide intent — accounts are the ledger. The
                per-account partition figures below are kept for reconciliation; you
                no longer need to rebalance them. The legacy <em>Drift</em> KPI just
                compares total assets to total envelope allocations.
            </div>

            <KpiStrip items={kpiItems} isLoading={q.isLoading} />

            <Card>
                <CardHeader>
                    <CardTitle>Money partition</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Where every dollar in your space is right now.
                    </p>
                </CardHeader>
                <CardContent>
                    {q.isLoading ? (
                        <Skeleton className="h-12 w-full" />
                    ) : t.partition.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Add accounts and allocations to see the partition.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <div className="flex h-7 overflow-hidden rounded-md">
                                {t.partition.map((p) => {
                                    const pctOfTotal =
                                        partitionTotal > 0
                                            ? p.value / partitionTotal
                                            : 0;
                                    return (
                                        <span
                                            key={p.label}
                                            title={`${p.label}: $${p.value.toLocaleString("en-US")}`}
                                            className="grid place-items-center text-[11px] font-semibold tracking-wide"
                                            style={{
                                                flex: p.value,
                                                backgroundColor: p.color,
                                                opacity: 0.92,
                                                color: "oklch(15% 0.02 290)",
                                            }}
                                        >
                                            {pctOfTotal > 0.06 ? p.label : ""}
                                        </span>
                                    );
                                })}
                            </div>
                            <div className="flex justify-between text-[10.5px] text-muted-foreground">
                                <span>$0</span>
                                <span>
                                    ${formatCompactTotal(partitionTotal)} total
                                </span>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function formatCompactTotal(n: number): string {
    if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)}K`;
    return Math.round(n).toLocaleString("en-US");
}
