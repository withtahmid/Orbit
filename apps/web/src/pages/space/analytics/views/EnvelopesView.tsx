import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";
import { ROUTES } from "@/router/routes";
import { cn } from "@/lib/utils";

export default function EnvelopesView() {
    const { space } = useCurrentSpace();
    const { period } = usePeriod("this-month");

    const q = trpc.analytics.envelopeUtilization.useQuery({
        spaceId: space.id,
        periodStart: period.start,
        periodEnd: period.end,
    });

    return (
        <AnalyticsDetailLayout
            title="Envelope utilization"
            description="How much of each envelope you've used. Monthly envelopes reset each period; rolling envelopes accumulate."
            actions={<PeriodSelector />}
        >
            <p className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Tip:</span> hover the bar
                for exact numbers. Click an envelope to see per-account breakdown and
                rebalance any drift.
            </p>

            {q.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-32 w-full" />
                    ))}
                </div>
            ) : (q.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No envelopes yet.</p>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {(q.data ?? []).map((e) => {
                        const rawPct =
                            e.allocated > 0
                                ? (e.consumed / e.allocated) * 100
                                : e.consumed > 0
                                  ? Infinity
                                  : 0;
                        const pct = Math.min(100, rawPct);
                        const over = rawPct > 100;
                        return (
                            <Link
                                key={e.envelopId}
                                to={ROUTES.spaceEnvelopeDetail(space.id, e.envelopId)}
                                className="group"
                            >
                                <Card
                                    className="transition-all hover:-translate-y-0.5 hover:border-foreground/20"
                                    style={{ borderLeft: `3px solid ${e.color}` }}
                                >
                                    <CardHeader>
                                        <CardTitle className="flex items-center justify-between text-base">
                                            <span className="flex min-w-0 items-center gap-2">
                                                <EntityAvatar
                                                    size="sm"
                                                    color={e.color}
                                                    icon={e.icon}
                                                />
                                                <span className="truncate">{e.name}</span>
                                                {e.cadence === "monthly" && (
                                                    <span className="rounded-sm bg-secondary px-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                                        Monthly
                                                    </span>
                                                )}
                                            </span>
                                            <span
                                                className={cn(
                                                    "text-sm",
                                                    over
                                                        ? "font-semibold text-destructive"
                                                        : "text-muted-foreground"
                                                )}
                                            >
                                                {Number.isFinite(rawPct)
                                                    ? `${rawPct.toFixed(0)}%`
                                                    : "—"}
                                                {over && Number.isFinite(rawPct) && " over"}
                                            </span>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="grid gap-3">
                                        <Progress
                                            value={pct}
                                            indicatorColor={
                                                over ? "var(--destructive)" : e.color
                                            }
                                        />
                                        <div className="grid grid-cols-3 gap-3 text-center">
                                            <Metric label="Allocated" value={e.allocated} />
                                            <Metric
                                                label="Spent"
                                                value={e.consumed}
                                                variant="expense"
                                            />
                                            <Metric
                                                label="Remaining"
                                                value={e.remaining}
                                                variant={
                                                    e.remaining < 0 ? "expense" : "neutral"
                                                }
                                            />
                                        </div>
                                        {e.breakdown.some((b) => b.isDrift) && (
                                            <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                                                <AlertTriangle className="size-3" />
                                                {
                                                    e.breakdown.filter((b) => b.isDrift)
                                                        .length
                                                }{" "}
                                                account
                                                {e.breakdown.filter((b) => b.isDrift)
                                                    .length === 1
                                                    ? ""
                                                    : "s"}{" "}
                                                drifted
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            )}
        </AnalyticsDetailLayout>
    );
}

function Metric({
    label,
    value,
    variant = "neutral",
}: {
    label: string;
    value: number;
    variant?: "neutral" | "income" | "expense";
}) {
    return (
        <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {label}
            </p>
            <MoneyDisplay amount={value} variant={variant} className="text-sm font-bold" />
        </div>
    );
}
