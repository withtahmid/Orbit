import { useMemo, useState } from "react";
import { addMonths, startOfMonth } from "@/lib/dates";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { KpiStrip, type KpiItem } from "@/components/shared/KpiStrip";
import { useCockpit } from "@/pages/space/analytics/CockpitContext";
import { trpc } from "@/trpc";

/**
 * Allocation map — two perspectives on your space-wide budget intent.
 *
 *   1. By envelope — how much is committed to each envelope (bar per envelope)
 *   2. Totals      — space-wide partition of every dollar (KPIs + sankey-ish bar)
 */
export function AllocationsSection() {
    const { space } = useCockpit();

    if (space.isPersonal) {
        return (
            <section className="grid gap-5 sm:gap-6">
                <div>
                    <h2 className="text-base font-semibold tracking-tight">
                        Allocation map
                    </h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        Where your budget is committed across envelopes.
                    </p>
                </div>
                <Card>
                    <CardContent className="py-12 text-center text-sm text-muted-foreground">
                        Allocation maps aren't available for personal money —
                        envelopes are space-wide.
                    </CardContent>
                </Card>
            </section>
        );
    }

    return (
        <section className="grid gap-5 sm:gap-6">
            <div>
                <h2 className="text-base font-semibold tracking-tight">
                    Allocation map
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    Where your budget is committed. Envelopes are space-wide
                    budget intent — this view shows how much sits in each.
                </p>
            </div>
            <Tabs defaultValue="by-envelope">
                <TabsList>
                    <TabsTrigger value="by-envelope">By envelope</TabsTrigger>
                    <TabsTrigger value="totals">Totals</TabsTrigger>
                </TabsList>
                <TabsContent value="by-envelope" className="mt-4">
                    <ByEnvelopePanel spaceId={space.id} />
                </TabsContent>
                <TabsContent value="totals" className="mt-4">
                    <TotalsPanel spaceId={space.id} />
                </TabsContent>
            </Tabs>
        </section>
    );
}

/**
 * Shared data hook — single tRPC fetch per panel mount; the three panels
 * read from the cache because react-query dedupes identical inputs.
 */
function useAllocations(spaceId: string) {
    return trpc.analytics.allocations.useQuery(
        { spaceId },
        { placeholderData: (prev) => prev }
    );
}

/* ============================================================
   1. BY ENVELOPE — one bar per envelope, width = committed budget
   ============================================================ */
function ByEnvelopePanel({ spaceId }: { spaceId: string }) {
    const q = useAllocations(spaceId);

    const rows = useMemo(() => {
        if (!q.data) return [];
        // Allocations are space-wide budget intent — one figure per
        // envelope. Each bar is the envelope's total committed budget in
        // its own color.
        return q.data.envelopes
            .map((e) => ({
                id: e.id,
                name: e.name,
                color: e.color,
                total: e.allocated,
            }))
            .filter((r) => r.total > 0);
    }, [q.data]);

    const max = Math.max(0, ...rows.map((r) => r.total));

    return (
        <Card>
            <CardHeader>
                <CardTitle>Budget committed per envelope</CardTitle>
                <p className="text-xs text-muted-foreground">
                    Each bar is one envelope. Width = total allocated.
                </p>
            </CardHeader>
            <CardContent className="grid gap-5">
                {q.isLoading && !q.data ? (
                    <Skeleton className="h-48 w-full" />
                ) : rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No envelope allocations yet. Allocate funds from any
                        envelope to populate this view.
                    </p>
                ) : (
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
                                        backgroundColor: r.color,
                                    }}
                                />
                                <MoneyDisplay
                                    amount={r.total}
                                    variant="neutral"
                                    className="text-right text-[12.5px] font-semibold"
                                />
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/* ============================================================
   2. TOTALS — KPI strip + sankey-ish partition bar
   ============================================================ */
function TotalsPanel({ spaceId }: { spaceId: string }) {
    const q = useAllocations(spaceId);

    // Authoritative free/held figures come from spaceSummary — the SAME source
    // the budgets page banner reads — so this view can never disagree with it.
    // Re-deriving "unallocated" locally from raw Σallocated (ignoring the
    // held clamp and liabilities) drifts from the real pool whenever an
    // envelope is overspent. See analytics/CLAUDE.md ("Held is
    // GREATEST(0, allocated − consumed) ... must produce the same number").
    const [now] = useState(() => new Date());
    const monthStart = startOfMonth(now);
    const monthEnd = addMonths(monthStart, 1);
    const summary = trpc.analytics.spaceSummary.useQuery(
        {
            spaceId,
            periodStart: monthStart,
            periodEnd: monthEnd,
        },
        { placeholderData: (prev) => prev }
    );

    const loading = (q.isLoading && !q.data) || (summary.isLoading && !summary.data);

    const t = useMemo(() => {
        if (!q.data || !summary.data) {
            return {
                totalAssets: 0,
                liabilities: 0,
                locked: 0,
                committed: 0,
                held: 0,
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
        // Gross budget intent (raw allocations) — a distinct concept from the
        // cash actually tied up. Kept for the "Committed" KPI only.
        const committed = q.data.envelopes.reduce((s, e) => s + e.allocated, 0);
        // Cash actually held in envelopes and the free pool — authoritative.
        const held = summary.data.envelopeRemaining;
        const unallocated = summary.data.unallocated;
        const drift = q.data.drift.delta;
        return {
            totalAssets,
            liabilities,
            locked,
            committed,
            held,
            unallocated,
            drift,
            // Cash-honest partition: held + free = spendable, plus locked, plus
            // liabilities. Uses the same held/free as the budgets banner.
            partition: [
                {
                    label: "Held in envelopes",
                    value: held,
                    color: "#a855f7",
                },
                {
                    label: "Locked savings",
                    value: locked,
                    color: "#3b82f6",
                },
                {
                    label: "Free",
                    value: Math.max(0, unallocated),
                    color: "#10b981",
                },
                {
                    label: "Liabilities",
                    value: liabilities,
                    color: "#ef4444",
                },
            ].filter((p) => p.value > 0),
        };
    }, [q.data, summary.data]);

    const partitionTotal = t.partition.reduce((s, p) => s + p.value, 0);

    const kpiItems: KpiItem[] = [
        {
            label: "Total assets",
            value: t.totalAssets,
            money: true,
            tone: "income",
        },
        {
            label: "Committed",
            value: t.committed,
            money: true,
            sub: "Budget intent across envelopes",
        },
        {
            label: "Unallocated",
            value: t.unallocated,
            money: true,
            // Sub-cent epsilon mirrors the server's `isOverAllocated`: two
            // PG-rounded numeric(20,2) sums can leave a −0.00x residue, and
            // without the guard this flips to "Over-budgeted" / expense tone at
            // a value that renders as "0.00".
            tone: t.unallocated < -0.005 ? "expense" : "neutral",
            sub: t.unallocated < -0.005 ? "Over-budgeted" : "Free to budget",
        },
        {
            label: "Drift",
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
                Envelopes are space-wide budget intent — accounts are the ledger.
                The <em>Drift</em> KPI compares total assets to total envelope
                allocations so you can see if you've committed more than you hold.
            </div>

            <KpiStrip items={kpiItems} isLoading={loading} />

            <Card>
                <CardHeader>
                    <CardTitle>Money partition</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Where every dollar in your space is right now.
                    </p>
                </CardHeader>
                <CardContent>
                    {loading ? (
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
                                            title={`${p.label}: ${p.value.toLocaleString("en-US")}`}
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
                                <span>0</span>
                                <span>
                                    {formatCompactTotal(partitionTotal)} total
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
