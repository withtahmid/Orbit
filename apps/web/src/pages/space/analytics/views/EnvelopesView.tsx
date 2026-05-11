import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { PeriodChip } from "@/components/shared/PeriodChip";
import { KpiStrip, type KpiItem } from "@/components/shared/KpiStrip";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";
import { ROUTES } from "@/router/routes";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

type Envelope = {
    envelopId: string;
    name: string;
    color: string;
    icon: string;
    cadence: "none" | "monthly";
    allocated: number;
    consumed: number;
    remaining: number;
    borrowedIn?: number;
    borrowedOut?: number;
    /** Present in the personal-space variant of the query. */
    spaceId?: string;
};

export default function EnvelopesView() {
    const { space } = useCurrentSpace();
    const { period } = usePeriod("this-month");

    const qSpace = trpc.analytics.envelopeUtilization.useQuery(
        {
            spaceId: space.id,
            periodStart: period.start,
            periodEnd: period.end,
        },
        { enabled: !space.isPersonal }
    );
    const qPersonal = trpc.personal.envelopeUtilization.useQuery(
        {
            periodStart: period.start,
            periodEnd: period.end,
        },
        { enabled: space.isPersonal }
    );
    const q = space.isPersonal ? qPersonal : qSpace;
    const envelopes = useMemo<Envelope[]>(
        () => (q.data ?? []) as Envelope[],
        [q.data]
    );

    const summary = useMemo(() => {
        let allocated = 0;
        let consumed = 0;
        let overCount = 0;
        let borrowedInTotal = 0;
        let borrowedOutCount = 0;
        for (const e of envelopes) {
            allocated += e.allocated;
            consumed += e.consumed;
            if (e.allocated > 0 && e.consumed > e.allocated) overCount++;
            if ((e.borrowedIn ?? 0) > 0) borrowedInTotal += e.borrowedIn ?? 0;
            if ((e.borrowedOut ?? 0) > 0) borrowedOutCount++;
        }
        const utilization =
            allocated > 0 ? Math.round((consumed / allocated) * 100) : 0;
        return {
            allocated,
            consumed,
            overCount,
            borrowedInTotal,
            borrowedOutCount,
            utilization,
        };
    }, [envelopes]);

    const sorted = useMemo(() => {
        return [...envelopes].sort((a, b) => {
            const pa = a.allocated > 0 ? a.consumed / a.allocated : 0;
            const pb = b.allocated > 0 ? b.consumed / b.allocated : 0;
            return pb - pa;
        });
    }, [envelopes]);

    const kpiItems: KpiItem[] = [
        {
            label: "Allocated",
            value: summary.allocated,
            money: true,
            sub: `Across ${envelopes.length} envelope${
                envelopes.length === 1 ? "" : "s"
            }`,
        },
        {
            label: "Spent",
            value: summary.consumed,
            money: true,
            tone: "expense",
            sub: `${summary.utilization}% utilization`,
        },
        {
            label: "Over budget",
            value: summary.overCount,
            valueFormat: "integer",
            tone: summary.overCount > 0 ? "expense" : "neutral",
            sub: `of ${envelopes.length} envelopes`,
        },
        {
            label: "Borrowed in",
            value: summary.borrowedInTotal,
            money: true,
            tone: summary.borrowedInTotal > 0 ? "expense" : "neutral",
            sub:
                summary.borrowedOutCount > 0
                    ? `${summary.borrowedOutCount} envelope${summary.borrowedOutCount === 1 ? "" : "s"} owe future periods`
                    : "no borrow obligations",
        },
    ];

    return (
        <AnalyticsDetailLayout
            title="Envelope utilization"
            description="How much of each envelope you've used. Bars exceeding 100% are over budget — overflow shown to the right of the cap."
            actions={<PeriodChip />}
        >
            <KpiStrip items={kpiItems} isLoading={q.isLoading} />

            <Card className="overflow-hidden p-0">
                <div className="flex flex-col gap-0.5 px-6 pt-5 pb-4">
                    <CardTitle>All envelopes</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Sorted by % consumed — click any envelope to drill in.
                    </p>
                </div>
                {q.isLoading ? (
                    <div className="px-6 pb-5">
                        <Skeleton className="h-72 w-full" />
                    </div>
                ) : sorted.length === 0 ? (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">
                        No envelopes yet.
                    </p>
                ) : (
                    <div className="flex flex-col">
                        {sorted.map((e, i) => (
                            <EnvelopeRow
                                key={e.envelopId}
                                envelope={e}
                                spaceIdForLink={
                                    space.isPersonal && e.spaceId
                                        ? e.spaceId
                                        : space.id
                                }
                                first={i === 0}
                            />
                        ))}
                    </div>
                )}
            </Card>

        </AnalyticsDetailLayout>
    );
}

function EnvelopeRow({
    envelope,
    spaceIdForLink,
    first,
}: {
    envelope: Envelope;
    spaceIdForLink: string;
    first: boolean;
}) {
    const allocated = envelope.allocated;
    const consumed = envelope.consumed;
    const rawPct = allocated > 0 ? consumed / allocated : consumed > 0 ? Infinity : 0;
    const isOver = rawPct > 1;
    const borrowedIn = envelope.borrowedIn ?? 0;
    const borrowedOut = envelope.borrowedOut ?? 0;
    const isUntouched = consumed === 0;
    const finitePct = Number.isFinite(rawPct);

    return (
        <Link
            to={ROUTES.spaceEnvelopeDetail(spaceIdForLink, envelope.envelopId)}
            className={cn(
                "group grid items-center gap-4 px-6 py-4 transition-colors hover:bg-accent/30",
                "grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto_auto] sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)_88px_92px_72px_16px]",
                !first && "border-t border-border/60"
            )}
        >
            {/* Identity column */}
            <div className="flex min-w-0 items-center gap-2.5">
                <EntityAvatar size="sm" color={envelope.color} icon={envelope.icon} />
                <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[13px] font-medium">
                        {envelope.name}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
                        {isOver && finitePct && (
                            <span className="rounded-sm border border-[color:var(--expense)]/30 bg-[color:var(--expense)]/10 px-1.5 py-px text-[9.5px] font-medium uppercase tracking-wider text-[color:var(--expense)]">
                                over
                            </span>
                        )}
                        {isUntouched && (
                            <span className="rounded-sm bg-secondary px-1.5 py-px text-[9.5px] font-medium uppercase tracking-wider text-muted-foreground">
                                untouched
                            </span>
                        )}
                        {envelope.cadence === "monthly" && !isOver && !isUntouched && (
                            <span className="rounded-sm bg-secondary px-1.5 py-px text-[9.5px] font-medium uppercase tracking-wider text-muted-foreground">
                                monthly
                            </span>
                        )}
                        {borrowedIn > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[color:var(--warning)]">
                                +{formatMoney(borrowedIn)} borrowed
                            </span>
                        )}
                        {borrowedOut > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[color:var(--expense)]">
                                −{formatMoney(borrowedOut)} owed
                            </span>
                        )}
                    </span>
                </div>
            </div>

            {/* Bar with overflow */}
            <UtilBar
                consumed={consumed}
                allocated={allocated}
                color={envelope.color}
            />

            {/* Spent amount */}
            <MoneyDisplay
                amount={consumed}
                variant="neutral"
                className="hidden text-right sm:inline"
            />

            {/* Of allocated */}
            <span className="hidden text-right text-[11.5px] text-muted-foreground sm:inline">
                of{" "}
                <span className="tabular-nums">
                    {formatMoney(allocated)}
                </span>
            </span>

            {/* Pct */}
            <span
                className={cn(
                    "hidden text-right text-xs font-semibold tabular-nums sm:inline",
                    isOver
                        ? "text-[color:var(--expense)]"
                        : rawPct > 0.85
                          ? "text-[color:var(--warning)]"
                          : "text-foreground"
                )}
            >
                {finitePct ? `${Math.round(rawPct * 100)}%` : "—"}
            </span>

            {/* Mobile pct + chevron */}
            <span className="flex items-center gap-2 sm:hidden">
                <span
                    className={cn(
                        "text-xs font-semibold tabular-nums",
                        isOver
                            ? "text-[color:var(--expense)]"
                            : rawPct > 0.85
                              ? "text-[color:var(--warning)]"
                              : "text-foreground"
                    )}
                >
                    {finitePct ? `${Math.round(rawPct * 100)}%` : "—"}
                </span>
            </span>

            <ChevronRight className="hidden size-4 text-muted-foreground/50 sm:inline group-hover:text-foreground" />
            <ArrowRight className="size-3.5 text-muted-foreground/50 sm:hidden group-hover:text-foreground" />
        </Link>
    );
}

/**
 * Horizontal progress bar that shows overage to the right of the cap.
 * - 0..100% renders inside `track` and uses `color`
 * - >100% shows a continuation in `--expense` to the right of the cap
 */
function UtilBar({
    consumed,
    allocated,
    color,
}: {
    consumed: number;
    allocated: number;
    color: string;
}) {
    if (allocated <= 0) {
        // No allocation — render an empty rail to keep alignment.
        return (
            <span className="block h-1.5 w-full rounded-full bg-muted/60" />
        );
    }
    const pct = Math.min(1, consumed / allocated);
    const overPct = Math.max(0, consumed / allocated - 1);
    const overScaled = Math.min(0.4, overPct);
    return (
        <span className="relative block h-1.5 w-full overflow-visible">
            <span className="absolute inset-y-0 left-0 right-0 rounded-full bg-muted/60" />
            <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                    width: `${pct * 100}%`,
                    backgroundColor: consumed > allocated ? "var(--expense)" : color,
                }}
            />
            {overScaled > 0 && (
                <span
                    className="absolute inset-y-0 rounded-full"
                    style={{
                        left: "100%",
                        width: `${overScaled * 100}%`,
                        backgroundColor:
                            "color-mix(in oklab, var(--expense) 60%, transparent)",
                    }}
                />
            )}
        </span>
    );
}
