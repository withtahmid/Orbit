import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import {
    AllocationFlowBar,
    type AllocationFlowRow,
} from "@/components/shared/charts/AllocationFlowBar";
import { Donut } from "@/components/shared/charts/Donut";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";

/**
 * The relational allocation view. Three perspectives on the same
 * (envelope × account) matrix:
 *   1. "By envelope" — for each envelope, which accounts fund it
 *   2. "By account"  — for each account, which envelopes/plans are earmarked
 *   3. "Totals"      — space-level summary donut of committed vs free cash
 */
export default function AllocationsView() {
    const { space } = useCurrentSpace();
    return (
        <AnalyticsDetailLayout
            title="Allocation map"
            description="The money-partitioning view. See how accounts fund envelopes and plans, and where drift lives."
        >
            <Tabs defaultValue="by-envelope">
                <TabsList className="h-auto flex-wrap">
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

function ByEnvelopePanel({ spaceId }: { spaceId: string }) {
    const { space } = useCurrentSpace();
    const envelopesQ = trpc.analytics.envelopeUtilization.useQuery({ spaceId });
    const accountsQ = trpc.account.listBySpace.useQuery({ spaceId });

    const accountsById = useMemo(() => {
        const m = new Map<string, { name: string; color: string; icon: string }>();
        for (const a of accountsQ.data ?? [])
            m.set(a.id, { name: a.name, color: a.color, icon: a.icon });
        return m;
    }, [accountsQ.data]);

    const rows: AllocationFlowRow[] = useMemo(
        () =>
            (envelopesQ.data ?? [])
                .filter((e) => e.allocated > 0)
                .map((e) => {
                    const segments = e.breakdown
                        .filter((b) => b.allocated > 0)
                        .map((b) => {
                            const acct = b.accountId
                                ? accountsById.get(b.accountId)
                                : null;
                            return {
                                id: b.accountId ?? "unassigned",
                                name: acct?.name ?? "Unassigned",
                                value: b.allocated,
                                color: acct?.color ?? "#64748b",
                            };
                        });
                    return {
                        id: e.envelopId,
                        name: e.name,
                        leading: (
                            <EntityAvatar size="sm" color={e.color} icon={e.icon} />
                        ),
                        segments:
                            segments.length > 0
                                ? segments
                                : [
                                      {
                                          id: e.envelopId,
                                          name: "Unsourced",
                                          value: e.allocated,
                                          color: e.color,
                                      },
                                  ],
                        onClick: undefined,
                    };
                }),
        [envelopesQ.data, accountsById]
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle>Which accounts fund each envelope</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
                {envelopesQ.isLoading ? (
                    <Skeleton className="h-60 w-full" />
                ) : (
                    <>
                        <p className="text-xs text-muted-foreground">
                            Each bar is one envelope; each color segment is one account that
                            contributed allocation. Width reflects the envelope&apos;s total
                            allocated amount.
                        </p>
                        <AllocationFlowBar
                            rows={rows.map((r) => ({
                                ...r,
                                onClick: () =>
                                    (window.location.href = ROUTES.spaceEnvelopeDetail(
                                        space.id,
                                        r.id
                                    )),
                            }))}
                            emptyLabel="No envelope allocations yet."
                        />
                    </>
                )}
            </CardContent>
        </Card>
    );
}

function ByAccountPanel({ spaceId }: { spaceId: string }) {
    const accountsQ = trpc.account.listBySpace.useQuery({ spaceId });
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

    const accounts = accountsQ.data ?? [];
    const activeAccountId =
        selectedAccountId ?? (accounts[0]?.id ?? null);

    const allocQ = trpc.analytics.accountAllocation.useQuery(
        { spaceId, accountId: activeAccountId ?? "" },
        { enabled: !!activeAccountId }
    );

    const envelopeRows: AllocationFlowRow[] = useMemo(
        () =>
            (allocQ.data?.envelopes ?? [])
                .filter((e) => e.allocated > 0 || e.consumed > 0)
                .map((e) => ({
                    id: e.envelopId,
                    name: e.name,
                    leading: <EntityAvatar size="sm" color={e.color} icon={e.icon} />,
                    segments: [
                        {
                            id: e.envelopId + "-remaining",
                            name: "Remaining",
                            value: Math.max(0, e.remaining),
                            color: e.color,
                        },
                        {
                            id: e.envelopId + "-consumed",
                            name: "Spent",
                            value: e.consumed,
                            color: "color-mix(in oklab, " + e.color + " 40%, transparent)",
                        },
                    ],
                })),
        [allocQ.data]
    );

    const planRows: AllocationFlowRow[] = useMemo(
        () =>
            (allocQ.data?.plans ?? []).map((p) => ({
                id: p.planId,
                name: p.name,
                leading: <EntityAvatar size="sm" color={p.color} icon={p.icon} />,
                segments: [
                    {
                        id: p.planId,
                        name: p.name,
                        value: p.allocated,
                        color: p.color,
                    },
                ],
            })),
        [allocQ.data]
    );

    return (
        <div className="grid gap-4">
            <Card>
                <CardHeader>
                    <CardTitle>Pick an account</CardTitle>
                </CardHeader>
                <CardContent>
                    <Select
                        value={activeAccountId ?? ""}
                        onValueChange={setSelectedAccountId}
                    >
                        <SelectTrigger className="w-full sm:w-64">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {accounts.map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                    <span className="flex items-center gap-2">
                                        <EntityAvatar
                                            size="sm"
                                            color={a.color}
                                            icon={a.icon}
                                        />
                                        {a.name}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {allocQ.data && (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle>Balance breakdown</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 grid-cols-3">
                            <Stat
                                label="Balance"
                                value={<MoneyDisplay amount={allocQ.data.balance} />}
                            />
                            <Stat
                                label="Earmarked"
                                value={<MoneyDisplay amount={allocQ.data.allocated} />}
                            />
                            <Stat
                                label="Unallocated"
                                value={
                                    <MoneyDisplay
                                        amount={allocQ.data.unallocated}
                                        variant={
                                            allocQ.data.unallocated < 0
                                                ? "expense"
                                                : "neutral"
                                        }
                                    />
                                }
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Envelopes funded from this account</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="mb-3 text-xs text-muted-foreground">
                                Solid block is remaining; lighter shade is spent this period.
                            </p>
                            <AllocationFlowBar
                                rows={envelopeRows}
                                emptyLabel="No envelope activity at this account."
                            />
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Plans funded from this account</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <AllocationFlowBar
                                rows={planRows}
                                emptyLabel="No plan allocations from this account."
                            />
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}

function TotalsPanel({ spaceId }: { spaceId: string }) {
    const envelopesQ = trpc.analytics.envelopeUtilization.useQuery({ spaceId });
    const plansQ = trpc.analytics.planProgress.useQuery({ spaceId });

    const envelopeDonut = useMemo(
        () =>
            (envelopesQ.data ?? [])
                .filter((e) => Math.max(0, e.remaining) > 0)
                .map((e) => ({
                    id: e.envelopId,
                    name: e.name,
                    value: Math.max(0, e.remaining),
                    color: e.color,
                    hint: `${e.cadence === "monthly" ? "Monthly" : "Rolling"} envelope`,
                })),
        [envelopesQ.data]
    );

    const planDonut = useMemo(
        () =>
            (plansQ.data ?? [])
                .filter((p) => p.allocated > 0)
                .map((p) => ({
                    id: p.planId,
                    name: p.name,
                    value: p.allocated,
                    color: p.color,
                })),
        [plansQ.data]
    );

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>Envelope remaining (current period)</CardTitle>
                </CardHeader>
                <CardContent>
                    <Donut
                        data={envelopeDonut}
                        centerLabel="Unspent in envelopes"
                        emptyLabel="No envelope balance to show."
                        height={320}
                    />
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Plan allocations</CardTitle>
                </CardHeader>
                <CardContent>
                    <Donut
                        data={planDonut}
                        centerLabel="In plans"
                        emptyLabel="No plan allocations."
                        height={320}
                    />
                </CardContent>
            </Card>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {label}
            </p>
            <div className="text-base font-bold">{value}</div>
        </div>
    );
}

