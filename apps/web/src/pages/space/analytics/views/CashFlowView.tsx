import { useMemo } from "react";
import { formatInAppTz } from "@/lib/formatDate";
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip as RTooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";

export default function CashFlowView() {
    const { space } = useCurrentSpace();
    const { period } = usePeriod("last-3-months");

    const q = trpc.analytics.cashFlow.useQuery({
        spaceId: space.id,
        periodStart: period.start,
        periodEnd: period.end,
        bucket: "month",
    });

    const summary = useMemo(() => {
        const rows = q.data ?? [];
        const income = rows.reduce((acc, r: any) => acc + Number(r.income ?? 0), 0);
        const expense = rows.reduce((acc, r: any) => acc + Number(r.expense ?? 0), 0);
        return { income, expense, net: income - expense };
    }, [q.data]);

    return (
        <AnalyticsDetailLayout
            title="Cash flow"
            description="Money in vs money out over the selected period. Each bar is one month."
            actions={<PeriodSelector defaultPreset="last-3-months" />}
        >
            <div className="grid gap-3 grid-cols-3">
                <Metric
                    label="Income"
                    value={
                        <MoneyDisplay
                            amount={summary.income}
                            variant="income"
                            className="block text-lg font-bold sm:text-2xl"
                        />
                    }
                />
                <Metric
                    label="Expenses"
                    value={
                        <MoneyDisplay
                            amount={summary.expense}
                            variant="expense"
                            className="block text-lg font-bold sm:text-2xl"
                        />
                    }
                />
                <Metric
                    label="Net"
                    value={
                        <MoneyDisplay
                            amount={summary.net}
                            variant={summary.net < 0 ? "expense" : "income"}
                            className="block text-lg font-bold sm:text-2xl"
                        />
                    }
                />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Monthly income vs expense</CardTitle>
                </CardHeader>
                <CardContent className="h-[320px] px-1 sm:h-[400px] sm:px-6">
                    {q.isLoading ? (
                        <Skeleton className="h-full w-full" />
                    ) : (q.data ?? []).length === 0 ? (
                        <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                            No cash flow data in this period.
                        </p>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={q.data ?? []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                <XAxis
                                    dataKey="bucket"
                                    tickFormatter={(v) => formatInAppTz(v, "MMM")}
                                    stroke="var(--muted-foreground)"
                                    fontSize={11}
                                />
                                <YAxis
                                    stroke="var(--muted-foreground)"
                                    fontSize={11}
                                    width={50}
                                />
                                <RTooltip
                                    contentStyle={{
                                        background: "var(--popover)",
                                        border: "1px solid var(--border)",
                                        borderRadius: 8,
                                    }}
                                    labelFormatter={(v) =>
                                        formatInAppTz(v as any, "MMMM yyyy")
                                    }
                                />
                                <Bar
                                    dataKey="income"
                                    fill="var(--income)"
                                    radius={[6, 6, 0, 0]}
                                />
                                <Bar
                                    dataKey="expense"
                                    fill="var(--expense)"
                                    radius={[6, 6, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>
        </AnalyticsDetailLayout>
    );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <Card>
            <CardContent className="p-4 sm:p-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
                    {label}
                </p>
                <div className="mt-1.5">{value}</div>
            </CardContent>
        </Card>
    );
}
