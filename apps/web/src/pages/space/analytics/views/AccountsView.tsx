import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Lock, Sparkles, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { KpiStrip, type KpiItem } from "@/components/shared/KpiStrip";
import { DrillableDonut } from "@/components/shared/charts/DrillableDonut";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import { cn } from "@/lib/utils";

type AccountType = "asset" | "liability" | "locked";

type Account = {
    accountId: string;
    name: string;
    accountType: AccountType;
    color: string;
    icon: string;
    balance: number;
};

/**
 * Account distribution view — where every dollar lives, broken into
 * three visually distinct groups so the user can read assets, debt,
 * and locked savings as separate concepts. Net worth = assets + locked
 * − liabilities. The donut visualises the asset+locked composition;
 * liabilities live in their own (red-tinted) card so they never bleed
 * into the asset slice colors.
 */
export default function AccountsView() {
    const { space } = useCurrentSpace();
    const qSpace = trpc.analytics.accountDistribution.useQuery(
        { spaceId: space.id },
        { enabled: !space.isPersonal }
    );
    const qPersonal = trpc.personal.accountDistribution.useQuery(undefined, {
        enabled: space.isPersonal,
    });
    const q = space.isPersonal ? qPersonal : qSpace;

    const accounts = useMemo<Account[]>(
        () => (q.data ?? []) as Account[],
        [q.data]
    );

    const grouped = useMemo(() => {
        return {
            asset: accounts.filter((a) => a.accountType === "asset"),
            liability: accounts.filter((a) => a.accountType === "liability"),
            locked: accounts.filter((a) => a.accountType === "locked"),
        };
    }, [accounts]);

    const totals = useMemo(() => {
        const assetSum = grouped.asset.reduce((s, a) => s + a.balance, 0);
        const lockedSum = grouped.locked.reduce((s, a) => s + a.balance, 0);
        const liabSum = grouped.liability.reduce((s, a) => s + a.balance, 0);
        const totalAssets = assetSum + lockedSum;
        const netWorth = totalAssets - liabSum;
        const lockedPctOfAssets =
            totalAssets > 0 ? (lockedSum / totalAssets) * 100 : 0;
        const topLockedName = grouped.locked
            .slice()
            .sort((a, b) => b.balance - a.balance)[0]?.name;
        return {
            totalAssets,
            assetSum,
            lockedSum,
            liabSum,
            netWorth,
            lockedPctOfAssets,
            topLockedName,
        };
    }, [grouped]);

    const donutSlices = useMemo(() => {
        // Donut shows assets + locked since both contribute to total wealth;
        // liabilities are visualised separately to avoid implying "negative
        // slice" geometry, which charts read poorly.
        return [...grouped.asset, ...grouped.locked]
            .filter((a) => a.balance > 0)
            .sort((a, b) => b.balance - a.balance)
            .map((a) => ({
                id: a.accountId,
                name: a.name,
                value: a.balance,
                color: a.color,
                drillable: false,
            }));
    }, [grouped]);

    const kpiItems: KpiItem[] = [
        {
            label: "Net worth",
            value: totals.netWorth,
            money: true,
            tone: totals.netWorth < 0 ? "expense" : "income",
            sub: totals.netWorth < 0 ? "Underwater" : "Assets minus liabilities",
        },
        {
            label: "Total assets",
            value: totals.totalAssets,
            money: true,
            sub: `${grouped.asset.length + grouped.locked.length} account${
                grouped.asset.length + grouped.locked.length === 1 ? "" : "s"
            }`,
        },
        {
            label: "Liabilities",
            value: totals.liabSum,
            money: true,
            tone: totals.liabSum > 0 ? "expense" : "neutral",
            sub:
                grouped.liability.length === 0
                    ? "No debt"
                    : `${grouped.liability.length} debt${
                          grouped.liability.length === 1 ? "" : "s"
                      }`,
        },
        {
            label: "Locked",
            value: totals.lockedSum,
            money: true,
            sub: totals.topLockedName
                ? `${totals.topLockedName} · ${totals.lockedPctOfAssets.toFixed(
                      0
                  )}% of assets`
                : "No locked savings",
        },
    ];

    return (
        <AnalyticsDetailLayout
            title="Account distribution"
            description="Where your money lives. Liabilities are debt and reduce net worth — always shown separately. Locked accounts (e.g. retirement) are in their own group."
        >
            <KpiStrip items={kpiItems} isLoading={q.isLoading} />

            <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                {/* Donut + per-account legend rows on the left */}
                <Card>
                    <CardHeader>
                        <CardTitle>Assets distribution</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        {q.isLoading ? (
                            <Skeleton className="h-[280px] w-full" />
                        ) : donutSlices.length === 0 ? (
                            <p className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                                No positive balances.
                            </p>
                        ) : (
                            <DrillableDonut
                                slices={donutSlices}
                                centerLabel="Total"
                                centerValue={formatNoDecimals(
                                    totals.totalAssets
                                )}
                                size={220}
                                thickness={22}
                            />
                        )}

                        {/* Per-account rows underneath — name + value + pct */}
                        {!q.isLoading && donutSlices.length > 0 && (
                            <div className="flex flex-col gap-1.5 border-t border-border/40 pt-3">
                                {donutSlices.map((s) => {
                                    const pct =
                                        totals.totalAssets > 0
                                            ? (s.value / totals.totalAssets) * 100
                                            : 0;
                                    return (
                                        <div
                                            key={s.id}
                                            className="grid items-center gap-2 grid-cols-[12px_minmax(0,1fr)_auto_40px]"
                                        >
                                            <span
                                                className="size-1.5 rounded-full"
                                                style={{ backgroundColor: s.color }}
                                            />
                                            <span className="truncate text-[12px] text-foreground/85">
                                                {s.name}
                                            </span>
                                            <MoneyDisplay
                                                amount={s.value}
                                                variant="neutral"
                                                className="text-[12px]"
                                            />
                                            <span className="text-right text-[11px] tabular-nums text-muted-foreground">
                                                {pct.toFixed(0)}%
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Three group cards on the right */}
                <div className="flex flex-col gap-3.5">
                    {q.isLoading ? (
                        <>
                            <Skeleton className="h-44 w-full" />
                            <Skeleton className="h-32 w-full" />
                            <Skeleton className="h-24 w-full" />
                        </>
                    ) : (
                        <>
                            <GroupCard
                                kind="asset"
                                title="Assets"
                                subtitle={`${grouped.asset.length} account${
                                    grouped.asset.length === 1 ? "" : "s"
                                }`}
                                total={totals.assetSum}
                                accounts={grouped.asset}
                                spaceId={space.id}
                                isPersonal={space.isPersonal}
                                totalAssetsForPct={totals.totalAssets}
                            />
                            {grouped.liability.length > 0 && (
                                <GroupCard
                                    kind="liability"
                                    title="Liabilities"
                                    subtitle="Debt · reduces net worth"
                                    total={totals.liabSum}
                                    accounts={grouped.liability}
                                    spaceId={space.id}
                                    isPersonal={space.isPersonal}
                                />
                            )}
                            {grouped.locked.length > 0 && (
                                <GroupCard
                                    kind="locked"
                                    title="Locked savings"
                                    subtitle="Cannot fund envelopes or plans"
                                    total={totals.lockedSum}
                                    accounts={grouped.locked}
                                    spaceId={space.id}
                                    isPersonal={space.isPersonal}
                                    totalAssetsForPct={totals.totalAssets}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>
        </AnalyticsDetailLayout>
    );
}

function GroupCard({
    kind,
    title,
    subtitle,
    total,
    accounts,
    spaceId,
    isPersonal,
    totalAssetsForPct,
}: {
    kind: AccountType;
    title: string;
    subtitle: string;
    total: number;
    accounts: Account[];
    spaceId: string;
    isPersonal: boolean;
    /** When provided, each row renders a `% of assets` cell. */
    totalAssetsForPct?: number;
}) {
    const isLiability = kind === "liability";
    return (
        <Card
            className="overflow-hidden p-0"
            style={
                isLiability
                    ? {
                          borderColor:
                              "color-mix(in oklab, var(--expense) 18%, var(--border))",
                      }
                    : undefined
            }
        >
            <div className="flex items-center justify-between gap-3 border-b border-border/40 px-5 py-3.5">
                <div className="flex flex-col gap-0.5">
                    <CardTitle>{title}</CardTitle>
                    <p className="text-[11px] text-muted-foreground">{subtitle}</p>
                </div>
                <MoneyDisplay
                    amount={isLiability ? -total : total}
                    variant={isLiability ? "expense" : "neutral"}
                    signed={isLiability}
                    className="text-[14px] font-semibold tabular-nums"
                />
            </div>
            <div className="flex flex-col">
                {accounts.map((a, i) => (
                    <Link
                        key={a.accountId}
                        to={
                            isPersonal
                                ? ROUTES.myAccounts
                                : ROUTES.spaceAccountDetail(spaceId, a.accountId)
                        }
                        className={cn(
                            "grid items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/30",
                            "grid-cols-[1fr_auto_56px]",
                            i > 0 && "border-t border-border/40"
                        )}
                    >
                        <span className="flex min-w-0 items-center gap-2.5">
                            <EntityAvatar size="sm" color={a.color} icon={a.icon} />
                            <span className="truncate text-[13px] font-medium">
                                {a.name}
                            </span>
                            <TypeChip kind={a.accountType} />
                        </span>
                        <MoneyDisplay
                            amount={isLiability ? -a.balance : a.balance}
                            variant={isLiability ? "expense" : "neutral"}
                            signed={isLiability}
                            className="text-[13px] font-semibold tabular-nums"
                        />
                        {totalAssetsForPct !== undefined ? (
                            <span className="text-right text-[11px] tabular-nums text-muted-foreground">
                                {totalAssetsForPct > 0
                                    ? `${(
                                          (a.balance / totalAssetsForPct) *
                                          100
                                      ).toFixed(0)}%`
                                    : "—"}
                            </span>
                        ) : (
                            <span />
                        )}
                    </Link>
                ))}
            </div>
        </Card>
    );
}

/**
 * Tiny inline pill matching the design's chip style. We don't reuse
 * `AccountTypeBadge` here because the design wants a much smaller,
 * lower-contrast pill that sits inside a row rather than next to a
 * full-size title.
 */
function TypeChip({ kind }: { kind: AccountType }) {
    if (kind === "asset") {
        return (
            <span
                className="inline-flex h-[18px] items-center gap-1 rounded-md border px-1.5 text-[9.5px] font-medium tracking-wide"
                style={{
                    color: "var(--income)",
                    borderColor:
                        "color-mix(in oklab, var(--income) 30%, transparent)",
                    background:
                        "color-mix(in oklab, var(--income) 10%, transparent)",
                }}
            >
                <Sparkles className="size-2.5" />
                Asset
            </span>
        );
    }
    if (kind === "liability") {
        return (
            <span
                className="inline-flex h-[18px] items-center gap-1 rounded-md border px-1.5 text-[9.5px] font-medium tracking-wide"
                style={{
                    color: "var(--expense)",
                    borderColor:
                        "color-mix(in oklab, var(--expense) 30%, transparent)",
                    background:
                        "color-mix(in oklab, var(--expense) 10%, transparent)",
                }}
            >
                <TrendingDown className="size-2.5" />
                Liability
            </span>
        );
    }
    return (
        <span
            className="inline-flex h-[18px] items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 text-[9.5px] font-medium tracking-wide text-muted-foreground"
        >
            <Lock className="size-2.5" />
            Locked
        </span>
    );
}

function formatNoDecimals(n: number): string {
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
