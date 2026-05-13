import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { PeriodChip } from "@/components/shared/PeriodChip";
import { KpiStrip, type KpiItem } from "@/components/shared/KpiStrip";
import { AnalyticsDetailLayout } from "./_AnalyticsLayout";
import { trpc, type RouterOutput } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";
import { ROUTES } from "@/router/routes";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

// Inherits every field the server actually returns (incl. `archived`,
// `carryIn`, `borrowedIn/Out`) so the page never drifts from the
// procedure shape. The optional `spaceId` is only present on the
// personal-space variant of the query.
type Envelope = RouterOutput["analytics"]["envelopeUtilization"][number] & {
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
    // Split active vs archived — archived envelopes sit under a
    // collapsible section so the main view stays focused on live state.
    const activeEnvelopes = useMemo(
        () => envelopes.filter((e) => !e.archived),
        [envelopes]
    );
    const archivedEnvelopes = useMemo(
        () => envelopes.filter((e) => e.archived),
        [envelopes]
    );
    const [showArchived, setShowArchived] = useState(false);

    const summary = useMemo(() => {
        let allocated = 0;
        let consumed = 0;
        let overCount = 0;
        let borrowedInTotal = 0;
        let borrowedOutCount = 0;
        for (const e of activeEnvelopes) {
            allocated += e.allocated;
            consumed += e.consumed;
            // Over only fires when this-period spending exceeded the
            // period pool (allocated + positive carry). Carry-debt alone
            // doesn't count.
            const cap = e.allocated + Math.max(0, e.carryIn ?? 0);
            if (cap > 0 && e.consumed > cap) overCount++;
            else if (cap === 0 && e.consumed > 0) overCount++;
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
    }, [activeEnvelopes]);

    const sorted = useMemo(() => {
        return [...activeEnvelopes].sort((a, b) => {
            const ca = a.allocated + Math.max(0, a.carryIn ?? 0);
            const cb = b.allocated + Math.max(0, b.carryIn ?? 0);
            const pa = ca > 0 ? a.consumed / ca : 0;
            const pb = cb > 0 ? b.consumed / cb : 0;
            return pb - pa;
        });
    }, [activeEnvelopes]);

    const kpiItems: KpiItem[] = [
        {
            label: "Allocated",
            value: summary.allocated,
            money: true,
            sub: `Across ${activeEnvelopes.length} envelope${
                activeEnvelopes.length === 1 ? "" : "s"
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
            sub: `of ${activeEnvelopes.length} envelopes`,
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
            description="How much of each envelope is left. Bars drain as you spend; envelopes you've overspent appear red with the overage to the right of the cap."
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
                        No active envelopes.
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

            {archivedEnvelopes.length > 0 && (
                <Card className="overflow-hidden p-0">
                    <button
                        type="button"
                        onClick={() => setShowArchived((v) => !v)}
                        aria-expanded={showArchived}
                        aria-controls="envelopes-archived-list"
                        className="flex w-full items-center gap-2 px-6 py-4 text-left transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    >
                        {showArchived ? (
                            <ChevronDown className="size-3.5 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="size-3.5 text-muted-foreground" />
                        )}
                        <span className="text-[13px] font-medium">
                            Archived
                        </span>
                        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10.5px] text-muted-foreground">
                            {archivedEnvelopes.length}
                        </span>
                        <span className="ml-auto text-[11px] text-muted-foreground">
                            {showArchived ? "Hide" : "Show"}
                        </span>
                    </button>
                    {showArchived && (
                        <div
                            id="envelopes-archived-list"
                            className="flex flex-col border-t border-border/60 opacity-70 transition-opacity hover:opacity-100"
                        >
                            {archivedEnvelopes.map((e, i) => (
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
            )}

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
    const carryIn = envelope.carryIn ?? 0;
    // Period-scoped pool: only positive carry adds to what's available to
    // spend this period. Negative carry (carry='both' debt) is *already*
    // deducted from net worth — it doesn't reduce period spendability,
    // and it must NOT make the "over" badge fire on envelopes that
    // haven't actually been overspent this period.
    const cap = allocated + Math.max(0, carryIn);
    const remaining = cap - consumed;
    const isOver = consumed > cap;
    const borrowedIn = envelope.borrowedIn ?? 0;
    const borrowedOut = envelope.borrowedOut ?? 0;
    const isUntouched = consumed === 0;
    // Percent SPENT against cap, kept around as a muted secondary cue.
    const pctSpent =
        cap > 0 ? consumed / cap : consumed > 0 ? Infinity : 0;
    const finitePct = Number.isFinite(pctSpent);

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
                        {/* LEDGER-REPLACEABLE: drops when the
                            envelop_allocations ledger expresses overspend
                            via 'reckon' rows. Kept adjacent to "over" so
                            related expense-toned signals visually cluster. */}
                        {(envelope.lifetimeOverrun ?? 0) > 0 && (
                            <span
                                className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-sm border border-[color:var(--expense)]/30 bg-[color:var(--expense)]/10 px-1.5 py-px text-[9.5px] font-medium uppercase tracking-wider text-[color:var(--expense)]"
                                title={`Across all time, ${envelope.name} has consumed ${formatMoney(envelope.lifetimeOverrun ?? 0)} more than it's been allocated.`}
                                aria-label={`Net overspent across all time by ${formatMoney(envelope.lifetimeOverrun ?? 0)}`}
                            >
                                net −{formatMoney(envelope.lifetimeOverrun ?? 0)} (lifetime)
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

            {/* Drain bar */}
            <UtilBar
                remaining={remaining}
                cap={cap}
                consumed={consumed}
                color={envelope.color}
            />

            {/* Remaining (primary cue) — abs value when over, with a sign
                cue via tone. */}
            <MoneyDisplay
                amount={Math.abs(remaining)}
                variant={isOver ? "expense" : "neutral"}
                className="hidden text-right sm:inline"
            />

            {/* Of cap — show "over budget" when over, "left of {cap}"
                otherwise. Suppressed when there's no cap to compare to. */}
            <span className="hidden text-right text-[11.5px] text-muted-foreground sm:inline">
                {isOver ? (
                    "over budget"
                ) : cap > 0 ? (
                    <>
                        left of{" "}
                        <span className="tabular-nums">
                            {formatMoney(cap)}
                        </span>
                    </>
                ) : (
                    "no budget"
                )}
            </span>

            {/* % spent — demoted secondary cue */}
            <span
                className={cn(
                    "hidden text-right text-[11px] tabular-nums sm:inline",
                    isOver
                        ? "text-[color:var(--expense)]"
                        : "text-muted-foreground"
                )}
            >
                {finitePct ? `${Math.round(pctSpent * 100)}% spent` : "—"}
            </span>

            {/* Mobile: same demoted % spent */}
            <span className="flex items-center gap-2 sm:hidden">
                <span
                    className={cn(
                        "text-[11px] tabular-nums",
                        isOver
                            ? "text-[color:var(--expense)]"
                            : "text-muted-foreground"
                    )}
                >
                    {finitePct ? `${Math.round(pctSpent * 100)}%` : "—"}
                </span>
            </span>

            <ChevronRight className="hidden size-4 text-muted-foreground/50 sm:inline group-hover:text-foreground" />
            <ArrowRight className="size-3.5 text-muted-foreground/50 sm:hidden group-hover:text-foreground" />
        </Link>
    );
}

/**
 * Drain bar — the filled portion represents how much of the envelope's
 * budget pool is *left*, depleting left → right as the user spends.
 *
 * - cap > 0, remaining ≥ 0: width = remaining / cap, color = envelope color
 * - remaining < 0: full red track + overflow tail to the right (same shape
 *   as the prior implementation's overage cue, just inverted source)
 * - cap ≤ 0 and nothing spent: empty rail to keep row alignment
 */
function UtilBar({
    remaining,
    cap,
    consumed,
    color,
}: {
    remaining: number;
    cap: number;
    consumed: number;
    color: string;
}) {
    if (cap <= 0 && consumed === 0) {
        return (
            <span className="block h-1.5 w-full rounded-full bg-muted/60" />
        );
    }
    const isOver = remaining < 0;
    const fillPct = isOver
        ? 1
        : cap > 0
          ? Math.max(0, Math.min(1, remaining / cap))
          : 0;
    const overByPct = isOver && cap > 0 ? -remaining / cap : 0;
    const overScaled = Math.min(0.4, overByPct);
    return (
        <span className="relative block h-1.5 w-full overflow-visible">
            <span className="absolute inset-y-0 left-0 right-0 rounded-full bg-muted/60" />
            <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                    width: `${fillPct * 100}%`,
                    backgroundColor: isOver ? "var(--expense)" : color,
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
