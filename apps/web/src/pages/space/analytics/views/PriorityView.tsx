import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { Donut } from "@/components/shared/charts/Donut";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";

export default function PriorityView() {
    const { space } = useCurrentSpace();
    const { period } = usePeriod("this-month");

    const q = trpc.analytics.priorityBreakdown.useQuery(
        {
            spaceId: space.id,
            periodStart: period.start,
            periodEnd: period.end,
        },
        { enabled: !space.isPersonal }
    );

    const rows = useMemo(() => q.data ?? [], [q.data]);
    const total = useMemo(
        () => rows.reduce((acc, r) => acc + Number(r.total), 0),
        [rows]
    );

    const donutData = useMemo(
        () =>
            rows
                .filter((r) => r.total > 0)
                .map((r) => ({
                    id: r.priority,
                    name: r.label,
                    value: Number(r.total),
                    color: r.color,
                })),
        [rows]
    );

    return (
        <AnalyticsDetailLayout
            title="Expenses by priority"
            description="Essential versus discretionary spend. Each envelope carries a priority tier; its categories inherit it. Transfer principal is excluded (transfers don't carry a category)."
            actions={<PeriodSelector defaultPreset="this-month" />}
        >
            {space.isPersonal ? (
                <Card>
                    <CardContent className="py-8 text-center text-sm text-muted-foreground">
                        Priority breakdown is a per-space view. Open a real
                        space to see it.
                    </CardContent>
                </Card>
            ) : (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle>Where the month went</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {q.isLoading ? (
                                <Skeleton className="h-[320px] w-full" />
                            ) : (
                                <Donut
                                    data={donutData}
                                    centerLabel="Total expense"
                                    height={320}
                                    emptyLabel="No expense recorded in this period."
                                />
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Breakdown</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-1">
                            {rows.map((r) => {
                                const pct =
                                    total > 0
                                        ? (Number(r.total) / total) * 100
                                        : 0;
                                return (
                                    <div
                                        key={r.priority}
                                        className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent/30"
                                    >
                                        <span className="flex items-center gap-2">
                                            <span
                                                className="inline-block size-2.5 rounded-full"
                                                style={{ backgroundColor: r.color }}
                                            />
                                            <span className="text-sm font-medium">
                                                {r.label}
                                            </span>
                                            <span className="text-xs text-muted-foreground tabular-nums">
                                                {pct.toFixed(0)}%
                                            </span>
                                        </span>
                                        <MoneyDisplay
                                            amount={Number(r.total)}
                                            variant="expense"
                                            className="tabular-nums"
                                        />
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                </>
            )}
        </AnalyticsDetailLayout>
    );
}
