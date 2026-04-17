import { format } from "date-fns";
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
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";

export default function BalanceHistoryView() {
    const { space } = useCurrentSpace();
    const { period } = usePeriod("last-3-months");

    const q = trpc.analytics.balanceHistory.useQuery({
        spaceId: space.id,
        periodStart: period.start,
        periodEnd: period.end,
        bucket: "day",
    });

    return (
        <AnalyticsDetailLayout
            title="Balance history"
            description="Total space balance (assets minus liabilities) over time."
            actions={<PeriodSelector defaultPreset="last-3-months" />}
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
                                    tickFormatter={(v) => format(new Date(v), "MMM d")}
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
                                        format(new Date(v as any), "MMM d, yyyy")
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
