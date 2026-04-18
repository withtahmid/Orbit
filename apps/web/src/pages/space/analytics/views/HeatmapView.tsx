import { useMemo } from "react";
import { formatInAppTz } from "@/lib/formatDate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { startOfYear, endOfYear, startOfMonth } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

export default function HeatmapView() {
    const { space } = useCurrentSpace();
    const start = startOfYear(new Date());
    const end = endOfYear(new Date());

    const q = trpc.analytics.spendingHeatmap.useQuery({
        spaceId: space.id,
        periodStart: start,
        periodEnd: end,
    });

    const byDay = useMemo(() => {
        const m = new Map<string, number>();
        for (const r of q.data ?? []) {
            m.set(formatInAppTz(r.day, "yyyy-MM-dd"), r.total);
        }
        return m;
    }, [q.data]);

    const { max, total, activeDays } = useMemo(() => {
        let m = 0;
        let total = 0;
        let days = 0;
        byDay.forEach((v) => {
            total += v;
            if (v > 0) days++;
            if (v > m) m = v;
        });
        return { max: m, total, activeDays: days };
    }, [byDay]);

    const weeks = useMemo(() => {
        const arr: Date[][] = [];
        const first = startOfMonth(new Date(new Date().getFullYear(), 0, 1));
        first.setDate(first.getDate() - first.getDay());
        for (let w = 0; w < 53; w++) {
            const wk: Date[] = [];
            for (let d = 0; d < 7; d++) {
                const dt = new Date(first);
                dt.setDate(first.getDate() + w * 7 + d);
                wk.push(dt);
            }
            arr.push(wk);
        }
        return arr;
    }, []);

    return (
        <AnalyticsDetailLayout
            title="Spending heatmap"
            description="Daily expense intensity for the year. Each cell is one day; darker means heavier spending."
        >
            <div className="grid gap-3 grid-cols-3">
                <Metric label="Year total">
                    <MoneyDisplay
                        amount={total}
                        variant="expense"
                        className="block text-lg font-bold sm:text-2xl"
                    />
                </Metric>
                <Metric label="Active days">
                    <span className="block text-lg font-bold sm:text-2xl">
                        {activeDays}
                    </span>
                </Metric>
                <Metric label="Peak day">
                    <MoneyDisplay
                        amount={max}
                        variant="expense"
                        className="block text-lg font-bold sm:text-2xl"
                    />
                </Metric>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Daily expenses</CardTitle>
                </CardHeader>
                <CardContent>
                    {q.isLoading ? (
                        <Skeleton className="h-36 w-full" />
                    ) : (
                        <div className="overflow-x-auto">
                            <div className="inline-flex gap-[3px]">
                                {weeks.map((wk, wi) => (
                                    <div key={wi} className="flex flex-col gap-[3px]">
                                        {wk.map((d, di) => {
                                            const v =
                                                byDay.get(
                                                    formatInAppTz(d, "yyyy-MM-dd")
                                                ) ?? 0;
                                            const intensity =
                                                max > 0 ? Math.min(1, v / max) : 0;
                                            return (
                                                <div
                                                    key={di}
                                                    title={`${formatInAppTz(d, "MMM d")} — ${formatMoney(v)}`}
                                                    className={cn(
                                                        "size-[12px] rounded-[3px] border border-border/60",
                                                        v === 0 && "bg-muted/30"
                                                    )}
                                                    style={
                                                        v > 0
                                                            ? {
                                                                  background: `color-mix(in oklab, var(--primary) ${Math.round(
                                                                      intensity * 100
                                                                  )}%, transparent)`,
                                                              }
                                                            : undefined
                                                    }
                                                />
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                            <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span>Less</span>
                                {[0.15, 0.3, 0.5, 0.75, 1].map((i) => (
                                    <span
                                        key={i}
                                        className="size-3 rounded-[3px] border border-border/60"
                                        style={{
                                            background: `color-mix(in oklab, var(--primary) ${Math.round(
                                                i * 100
                                            )}%, transparent)`,
                                        }}
                                    />
                                ))}
                                <span>More</span>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </AnalyticsDetailLayout>
    );
}

function Metric({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <Card>
            <CardContent className="p-4 sm:p-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
                    {label}
                </p>
                <div className="mt-1.5">{children}</div>
            </CardContent>
        </Card>
    );
}
