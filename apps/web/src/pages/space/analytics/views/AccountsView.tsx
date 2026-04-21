import { Link } from "react-router-dom";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountTypeBadge } from "@/components/shared/AccountTypeBadge";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { Donut } from "@/components/shared/charts/Donut";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";

type AccountType = "asset" | "liability" | "locked";

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

    const grouped = useMemo(() => {
        const rows = q.data ?? [];
        return {
            asset: rows.filter((a) => a.accountType === "asset"),
            liability: rows.filter((a) => a.accountType === "liability"),
            locked: rows.filter((a) => a.accountType === "locked"),
        };
    }, [q.data]);

    const donutData = useMemo(
        () =>
            (q.data ?? [])
                .filter((a) => a.accountType !== "liability" && a.balance > 0)
                .map((a) => ({
                    id: a.accountId,
                    name: a.name,
                    value: Number(a.balance),
                    color: a.color,
                    hint:
                        a.accountType === "locked"
                            ? "Locked savings — cannot be spent directly"
                            : undefined,
                })),
        [q.data]
    );

    return (
        <AnalyticsDetailLayout
            title="Account distribution"
            description="Where your money lives. Liabilities are debt and shown separately — they reduce net worth."
        >
            <Card>
                <CardHeader>
                    <CardTitle>Assets and locked savings</CardTitle>
                </CardHeader>
                <CardContent>
                    {q.isLoading ? (
                        <Skeleton className="h-[320px] w-full" />
                    ) : (
                        <Donut
                            data={donutData}
                            centerLabel="Total"
                            height={320}
                            emptyLabel="No positive balances."
                        />
                    )}
                </CardContent>
            </Card>

            {(["asset", "liability", "locked"] as const).map((type) =>
                grouped[type].length === 0 ? null : (
                    <Card key={type} className="p-0">
                        <CardHeader>
                            <CardTitle className="text-base capitalize">
                                {type === "asset"
                                    ? "Assets"
                                    : type === "liability"
                                      ? "Liabilities (debt)"
                                      : "Locked savings"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-1">
                            {grouped[type].map((a) => (
                                <Link
                                    key={a.accountId}
                                    to={
                                        // Virtual space has no per-account
                                        // detail route — link back to the
                                        // global /accounts page where space
                                        // chips let the user drill into any
                                        // real space that hosts the account.
                                        space.isPersonal
                                            ? ROUTES.myAccounts
                                            : ROUTES.spaceAccountDetail(
                                                  space.id,
                                                  a.accountId
                                              )
                                    }
                                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent/30"
                                >
                                    <span className="flex items-center gap-2">
                                        <EntityAvatar
                                            size="sm"
                                            color={a.color}
                                            icon={a.icon}
                                        />
                                        <span className="text-sm font-medium">{a.name}</span>
                                        <AccountTypeBadge type={a.accountType as AccountType} />
                                    </span>
                                    <MoneyDisplay
                                        amount={Number(a.balance)}
                                        variant={
                                            a.accountType === "liability"
                                                ? "expense"
                                                : "neutral"
                                        }
                                        className="tabular-nums"
                                    />
                                </Link>
                            ))}
                        </CardContent>
                    </Card>
                )
            )}
        </AnalyticsDetailLayout>
    );
}
