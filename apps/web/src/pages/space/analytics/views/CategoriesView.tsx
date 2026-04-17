import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { Donut } from "@/components/shared/charts/Donut";
import { AllocationFlowBar } from "@/components/shared/charts/AllocationFlowBar";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";

export default function CategoriesView() {
    const { space } = useCurrentSpace();
    const { period } = usePeriod("this-month");

    const q = trpc.analytics.categoryBreakdown.useQuery({
        spaceId: space.id,
        periodStart: period.start,
        periodEnd: period.end,
    });

    const topLevel = useMemo(
        () => (q.data ?? []).filter((c) => c.parentId === null),
        [q.data]
    );

    const childrenByParent = useMemo(() => {
        const m = new Map<string, typeof q.data extends readonly (infer U)[] ? U[] : never>();
        for (const c of q.data ?? []) {
            if (c.parentId) {
                const arr = (m.get(c.parentId) as any) ?? [];
                arr.push(c);
                m.set(c.parentId, arr as any);
            }
        }
        return m;
    }, [q.data]);

    const donutData = topLevel.map((c) => ({
        id: c.id,
        name: c.name,
        value: c.subtreeTotal,
        color: c.color,
        hint: `Rolled-up total including sub-categories`,
    }));

    return (
        <AnalyticsDetailLayout
            title="Spending by category"
            description="Top-level categories rolled up with their children. Click a segment or row to focus."
            actions={<PeriodSelector />}
        >
            <Card>
                <CardHeader>
                    <CardTitle>Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                    {q.isLoading ? (
                        <Skeleton className="h-[280px] w-full" />
                    ) : (
                        <Donut
                            data={donutData}
                            centerLabel="Total spent"
                            height={300}
                            emptyLabel="No spending in this period."
                        />
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Top categories with sub-category breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                    {q.isLoading ? (
                        <Skeleton className="h-64 w-full" />
                    ) : topLevel.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No spending to analyze.
                        </p>
                    ) : (
                        <AllocationFlowBar
                            rows={topLevel
                                .filter((c) => c.subtreeTotal > 0)
                                .map((c) => {
                                    const children = (childrenByParent.get(c.id) ??
                                        []) as typeof topLevel;
                                    const segments =
                                        children.length > 0
                                            ? [
                                                  ...(c.directTotal > 0
                                                      ? [
                                                            {
                                                                id: c.id + "-self",
                                                                name: c.name + " (direct)",
                                                                value: c.directTotal,
                                                                color: c.color,
                                                            },
                                                        ]
                                                      : []),
                                                  ...children
                                                      .filter((k) => k.subtreeTotal > 0)
                                                      .map((k) => ({
                                                          id: k.id,
                                                          name: k.name,
                                                          value: k.subtreeTotal,
                                                          color: k.color,
                                                      })),
                                              ]
                                            : [
                                                  {
                                                      id: c.id,
                                                      name: c.name,
                                                      value: c.subtreeTotal,
                                                      color: c.color,
                                                  },
                                              ];
                                    return {
                                        id: c.id,
                                        name: c.name,
                                        leading: (
                                            <EntityAvatar
                                                size="sm"
                                                color={c.color}
                                                icon={c.icon}
                                            />
                                        ),
                                        segments,
                                        rightLabel: undefined,
                                    };
                                })}
                        />
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>All categories</CardTitle>
                </CardHeader>
                <CardContent>
                    {q.isLoading ? (
                        <Skeleton className="h-48 w-full" />
                    ) : (q.data ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No categories yet.
                        </p>
                    ) : (
                        <div className="grid gap-1">
                            {(q.data ?? []).map((c) => (
                                <div
                                    key={c.id}
                                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent/30"
                                    style={{
                                        paddingLeft: `${(c.parentId ? 1.5 : 0.5) * 16}px`,
                                    }}
                                >
                                    <span className="flex min-w-0 items-center gap-2">
                                        <EntityAvatar
                                            size="sm"
                                            color={c.color}
                                            icon={c.icon}
                                        />
                                        <span className="truncate text-sm">{c.name}</span>
                                    </span>
                                    <span className="shrink-0 text-right">
                                        <MoneyDisplay
                                            amount={c.subtreeTotal}
                                            variant="expense"
                                        />
                                        {c.parentId === null &&
                                            c.subtreeTotal !== c.directTotal && (
                                                <span className="ml-2 text-[11px] text-muted-foreground">
                                                    ({formatInline(c.directTotal)} direct)
                                                </span>
                                            )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </AnalyticsDetailLayout>
    );
}

function formatInline(n: number): string {
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(n);
}
