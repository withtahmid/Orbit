import {
    useMemo,
    useState,
    type ComponentProps,
    type CSSProperties,
    type ReactNode,
} from "react";
import { Link, useParams } from "react-router-dom";
import {
    ArchiveRestore,
    ArrowRightLeft,
    ChevronLeft,
    ChevronRight,
    Coins,
    Pencil,
} from "lucide-react";
import { formatInAppTz } from "@/lib/formatDate";
import { startOfMonth, endOfMonth, addMonths } from "@/lib/dates";
import { compactMoney } from "@/lib/chartBucket";
import { toast } from "sonner";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { EnvelopeAllocateDialog } from "@/features/allocations/EnvelopeAllocateDialog";
import { EnvelopeMoveDialog } from "@/features/allocations/EnvelopeMoveDialog";
import { EnvelopeTopUpDialog } from "@/features/allocations/EnvelopeTopUpDialog";
import { EnvelopeGlass } from "@/components/budget-gauge/EnvelopeGlass";
import {
    EnvelopePaceChart,
    type ChartPoint,
} from "@/components/budget-gauge/EnvelopePaceChart";
import { EnvelopeSpendChart } from "@/components/budget-gauge/EnvelopeSpendChart";
import { Donut } from "@/components/shared/charts/Donut";
import { trpc } from "@/trpc";
import { useCanEdit, useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import { getIcon } from "@/lib/entityIcons";
import { CreateOrEditEnvelopeDialog } from "./BudgetsPage";

const DAY = 86_400_000;
const daysBetween = (a: Date, b: Date) =>
    Math.max(0, Math.round((b.getTime() - a.getTime()) / DAY));
const money2 = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) =>
    Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

type Tone = "brand" | "warn" | "expense" | "gold";
const toneVar: Record<Tone, string> = {
    brand: "var(--brand)",
    warn: "var(--warn)",
    expense: "var(--expense)",
    gold: "var(--gold)",
};

interface GoalChart {
    kind: "goal";
    title: string;
    subtitle: string;
    legend: Array<{ label: string; kind: "solid" | "dash" | "dot"; color: string }>;
    foot: ReactNode;
    props: ComponentProps<typeof EnvelopePaceChart>;
}
interface SpendChart {
    kind: "spend";
    title: string;
    subtitle: string;
    legend: Array<{ label: string; kind: "solid" | "dash" | "dot"; color: string }>;
    foot: ReactNode;
    race: ComponentProps<typeof EnvelopeSpendChart>;
}
type ChartVM = GoalChart | SpendChart;

export default function BudgetDetailPage() {
    const { space } = useCurrentSpace();
    const canEdit = useCanEdit();
    const { envelopeId } = useParams<{ envelopeId: string }>();
    const [editOpen, setEditOpen] = useState(false);
    const [monthOffset, setMonthOffset] = useState(0);

    const now = useMemo(() => new Date(), []);
    // Step from a MONTH-START, not the raw current date — otherwise
    // addMonths preserves the day-of-month and overflows short months (on
    // the 31st, stepping back skips Feb/Apr/Jun and repeats others).
    const viewingDate = useMemo(
        () => addMonths(startOfMonth(now), monthOffset),
        [now, monthOffset]
    );
    const periodStart = useMemo(() => startOfMonth(viewingDate), [viewingDate]);
    const periodEnd = useMemo(() => endOfMonth(viewingDate), [viewingDate]);
    // The dailyComparison "anchor" is where the period + the "today" marker
    // land. For the current month that's now (mid-month); for a past month we
    // anchor at the LAST INSTANT of that month so the whole, completed month
    // renders. NB: endOfMonth() returns the *exclusive* next-month start, so we
    // step back 1ms — otherwise date_trunc('month', anchor) would land on the
    // following month and the chart wouldn't move.
    const anchor = useMemo(
        () => (monthOffset === 0 ? now : new Date(periodEnd.getTime() - 1)),
        [monthOffset, now, periodEnd]
    );

    const utilizationQuery = trpc.analytics.envelopeUtilization.useQuery({
        spaceId: space.id,
        periodStart,
        periodEnd,
    });

    const envelope = utilizationQuery.data?.find((e) => e.envelopId === envelopeId);
    const isGoal =
        !!envelope && envelope.targetAmount != null && envelope.targetAmount > 0;

    // Daily spend series for the pace chart (monthly + rolling only; goals
    // have no per-deposit funding history to plot, so they use envelope
    // fields directly). Scoped to this envelope via the envelopeIds filter.
    const dailyQuery = trpc.analytics.trends.dailyComparison.useQuery(
        {
            spaceId: space.id,
            granularity: "month",
            anchor,
            // Expense-only, so the chart's "spent" matches the hero's
            // `consumed` (which excludes cross-space transfer principal).
            mode: "operational",
            envelopeIds: envelopeId ? [envelopeId] : [],
        },
        { enabled: !!envelope && !isGoal }
    );

    // Coaching KPIs (last month / 3-mo avg) — returns every envelope; filter.
    // Reference the viewed month so "last month" is relative to it.
    const averagesQuery = trpc.analytics.envelopeRecentAverages.useQuery(
        { spaceId: space.id, referenceDate: periodStart },
        { enabled: !!envelope && !isGoal }
    );
    const averages = averagesQuery.data?.find((a) => a.envelopId === envelopeId);

    // "Where it went" — this envelope's spend split across its categories for
    // the period. Reuses the analytics categoryBreakdown query (envelope-scoped)
    // + the shared Donut chart.
    const catQuery = trpc.analytics.categoryBreakdown.useQuery(
        {
            spaceId: space.id,
            periodStart,
            periodEnd,
            envelopeIds: envelopeId ? [envelopeId] : [],
        },
        { enabled: !!envelope }
    );
    const catData = useMemo(() => {
        const rows = catQuery.data ?? [];
        // Roll spend up to ROOT categories: only top-level rows (parentId
        // null), valued by their subtree total (own + descendants), which the
        // query already computes envelope-scoped.
        const roots = rows
            .filter((r) => r.parentId === null && r.subtreeTotal > 0)
            .sort((a, b) => b.subtreeTotal - a.subtreeTotal)
            .map((r) => ({
                id: r.id,
                name: r.name,
                value: r.subtreeTotal,
                color: r.color,
            }));
        // The donut is scoped to THIS MONTH (categoryBreakdown uses
        // periodStart/End), so reconcile it against this-month spend and show
        // any uncategorized remainder as its own wedge. The authoritative
        // this-month total differs by cadence:
        //   - monthly: `consumed` is already period-windowed.
        //   - rolling: `consumed` is LIFETIME, so use the cumulated this-month
        //     spend from the daily series instead (else the donut under-counts
        //     vs. the chart directly above it).
        // Goals fund via allocations, not category spend, so skip them.
        if (envelope && !isGoal) {
            const daily = dailyQuery.data;
            const periodSpend =
                envelope.cadence === "monthly"
                    ? envelope.consumed
                    : daily
                      ? daily.current.reduce((s, v) => s + (v ?? 0), 0)
                      : null;
            const categorized = roots.reduce((s, d) => s + d.value, 0);
            // Dormant caveat: categoryBreakdown also scopes to space accounts
            // while the spend totals don't, so an expense sourced from a
            // non-space account (not a normal case for an envelope) would land
            // here as "Uncategorized". Guarded to non-negative below.
            const uncat =
                periodSpend != null
                    ? Math.round((periodSpend - categorized) * 100) / 100
                    : 0;
            if (uncat > 0.005) {
                roots.push({
                    id: "__uncat",
                    name: "Uncategorized",
                    value: uncat,
                    // Neutral tokens (not hardcoded slate) so the misc wedges
                    // track the theme; the page renders inside .orbit-design.
                    color: "var(--fg-3)",
                });
            }
        }
        return roots;
    }, [catQuery.data, envelope, isGoal, dailyQuery.data]);
    const catTotal = useMemo(
        () => catData.reduce((s, d) => s + d.value, 0),
        [catData]
    );
    // Donut is unreadable past ~8 slices, so cap it to the top few + an
    // "Other" wedge. The full list still lives in the legend beside it.
    const donutSlices = useMemo(() => {
        const TOP = 8;
        if (catData.length <= TOP + 1) return catData;
        const top = catData.slice(0, TOP);
        const restTotal = catData
            .slice(TOP)
            .reduce((s, d) => s + d.value, 0);
        return restTotal > 0
            ? [...top, { id: "__other", name: "Other", value: restTotal, color: "var(--fg-4)" }]
            : top;
    }, [catData]);

    const monthLabel = formatInAppTz(viewingDate, "MMM yyyy");

    // ---- the numbers shown in the hero ----
    const total = envelope ? envelope.allocated : 0;
    const remaining = envelope ? envelope.remaining : 0;
    const over = !!envelope && !isGoal && envelope.consumed > total && total > 0;
    // No budget allocated yet is not a failure, just un-budgeted — show it
    // neutrally rather than as a red overspend or a misleading gold "Remaining"
    // (which would read as money still available). Covers a fresh envelope
    // (nothing spent yet) too, so it never renders a gold "Remaining 0.00".
    const noBudget = !!envelope && !isGoal && total <= 0;
    const goalSaved = envelope?.lifetimeFunded ?? 0;
    const goalTarget = envelope?.targetAmount ?? 0;
    // A goal that's been spent against — its saved pool has drained. Surfaces
    // "Spent" and softens "Goal reached" → "Funded" so the drain is visible.
    const goalSpent = isGoal ? envelope?.consumed ?? 0 : 0;
    // Archived envelopes are frozen/read-only — never paint a red/amber alarm
    // on them anywhere (label still carries the fact). Neutralize alarm tones.
    const archived = !!envelope?.archived;
    const muteTone = <T extends string>(t: T): T | "fg" =>
        archived && (t === "expense" || t === "warn") ? "fg" : t;

    // ---- assemble the pace chart per cadence ----
    const chart = useMemo<ChartVM | null>(() => {
        if (!envelope) return null;
        // Alarm colours are muted on archived (frozen) envelopes so the chart
        // foot doesn't shout red/amber at a read-only object.
        const expenseC = archived ? "var(--fg-3)" : "var(--expense)";
        const warnC = archived ? "var(--fg-3)" : "var(--warn)";

        // ------- GOAL: saving pace toward the target -------
        if (isGoal) {
            const now = new Date();
            const start = envelope.firstAllocatedAt
                ? new Date(envelope.firstAllocatedAt)
                : now;
            const elapsedDays = daysBetween(start, now);
            // A per-day rate needs at least a full day of history — otherwise a
            // same-day lump sum implies a multi-million/mo pace and a "done
            // tomorrow" projection on a goal's very first day.
            const trackable = elapsedDays >= 1;
            const nowX = Math.max(elapsedDays, 0.0001);
            const saved = goalSaved;
            const target = goalTarget;
            const reached = saved >= target;
            const targetDate = envelope.targetDate
                ? new Date(envelope.targetDate)
                : null;
            const targetX = targetDate ? daysBetween(start, targetDate) : null;

            // Projected completion at the realized average funding rate.
            const rate = trackable && saved > 0 ? saved / nowX : 0; // per day
            const rawCompletionX = !reached && rate > 0 ? target / rate : null;
            const completionDate =
                rawCompletionX != null
                    ? new Date(start.getTime() + rawCompletionX * DAY)
                    : null;
            // Cap how far right a badly-behind projection can push the x-axis
            // (a goal 100 days in with almost nothing saved projects ~100k days
            // out, crushing the realized line into the y-axis). The foot text
            // still states the true, un-capped completion date.
            const capX = Math.max(targetX ?? 0, nowX) * 3;
            const completionX =
                rawCompletionX != null ? Math.min(rawCompletionX, capX) : null;

            const xMax =
                // Floor at ~30 days so a brand-new / same-day-funded goal with
                // no deadline shows a sensible month-wide window instead of a
                // degenerate ~0-width chart pinned to the y-axis.
                Math.max(nowX, targetX ?? 0, completionX ?? 0, nowX * 1.2, 30) *
                1.04;
            const yMax = Math.max(target, saved) * 1.1 || 1;

            const actual: ChartPoint[] = [
                { x: 0, y: 0 },
                { x: nowX, y: Math.min(saved, yMax) },
            ];
            const pace: ChartPoint[] | null =
                targetX != null ? [{ x: 0, y: 0 }, { x: targetX, y: target }] : null;
            const projection: ChartPoint[] | null =
                rawCompletionX != null && completionX != null
                    ? [
                          { x: nowX, y: saved },
                          {
                              // If the projection was capped, stop the line at
                              // the edge with the interpolated y so its slope
                              // stays truthful.
                              x: completionX,
                              y:
                                  completionX >= rawCompletionX
                                      ? target
                                      : saved +
                                        (target - saved) *
                                            ((completionX - nowX) /
                                                (rawCompletionX - nowX)),
                          },
                      ]
                    : null;

            const xTicks: Array<{ x: number; label: string }> = [
                { x: 0, label: formatInAppTz(start, "MMM ''yy") },
            ];
            if (targetX != null && targetDate)
                xTicks.push({ x: targetX, label: formatInAppTz(targetDate, "MMM ''yy") });
            else if (completionDate && completionX != null)
                xTicks.push({
                    x: completionX,
                    label: formatInAppTz(completionDate, "MMM ''yy"),
                });

            const overFunded = saved - target;
            let foot: ReactNode;
            if (reached) {
                // Don't announce an unclamped ">100%"; state over-funding
                // explicitly instead so the number never reads oddly.
                foot =
                    overFunded > 0.005 ? (
                        <span>
                            Goal reached — <b style={{ color: "var(--gold)" }}>fully funded</b>,{" "}
                            {money0(overFunded)} over target
                            {goalSpent > 0 ? (
                                <>
                                    {" "}
                                    · <b className="tabular">{money0(goalSpent)}</b> spent
                                </>
                            ) : null}
                            .
                        </span>
                    ) : (
                        <span>
                            Goal reached — <b style={{ color: "var(--gold)" }}>100% funded</b>
                            {goalSpent > 0 ? (
                                <>
                                    {" "}
                                    · <b className="tabular">{money0(goalSpent)}</b> spent
                                </>
                            ) : null}
                            .
                        </span>
                    );
            } else if (completionDate) {
                const onTime = targetDate ? completionDate <= targetDate : true;
                foot = (
                    <span>
                        At your average of{" "}
                        <b className="tabular">{money0(rate * 30)}/mo</b> you'll reach{" "}
                        {money0(target)} by{" "}
                        <b>{formatInAppTz(completionDate, "MMM yyyy")}</b>
                        {targetDate ? (
                            <>
                                {" "}
                                —{" "}
                                <b style={{ color: onTime ? "var(--income)" : expenseC }}>
                                    {onTime ? "on track" : "behind"}
                                </b>{" "}
                                for the {formatInAppTz(targetDate, "MMM yyyy")} target.
                            </>
                        ) : (
                            "."
                        )}
                    </span>
                );
            } else if (saved > 0) {
                foot = (
                    <span>
                        Funded <b className="tabular">{money0(saved)}</b> so far — your
                        saving pace appears once there's more than a day of history.
                    </span>
                );
            } else {
                foot = <span>Fund this goal to start tracking your pace.</span>;
            }

            return {
                kind: "goal",
                title: "Saving pace",
                subtitle:
                    "Average saved-so-far (no per-deposit history) vs. the pace that reaches your target on time.",
                legend: [
                    { label: "Saved (avg)", kind: "dash", color: envelope.color },
                    { label: "On-time pace", kind: "dash", color: "var(--fg-2)" },
                    { label: "Projected", kind: "dot", color: "var(--warn)" },
                ],
                foot,
                props: {
                    xMax,
                    yMax,
                    yTicks: niceTicks(yMax),
                    xTicks,
                    actual,
                    pace,
                    projection,
                    capY: target,
                    capLabel: `TARGET ${money0(target)}`,
                    todayX: nowX,
                    accent: envelope.color,
                    projColor: "var(--warn)",
                    fmtY: compactMoney,
                    actualKind: "synthetic",
                    ariaLabel: `Saving pace: ${money0(saved)} of ${money0(target)} saved`,
                },
            };
        }

        // ------- SPEND (monthly + rolling) — reuse the interactive
        // analytics cumulative-race chart, scoped to this envelope, and
        // (monthly only) overlay the on-budget pace line via `budget`. -------
        const daily = dailyQuery.data;
        if (!daily) return null;
        const pl = daily.periodLength;
        const today = Math.min(daily.today, pl);

        // Cumulate the daily series exactly as the Trends view does.
        const cur: number[] = [];
        const prv: number[] = [];
        const avg: number[] | null = daily.average ? [] : null;
        let ca = 0,
            pa = 0,
            aa = 0;
        const len = Math.max(pl, daily.previous.length);
        for (let i = 0; i < len; i++) {
            ca += daily.current[i] ?? 0;
            pa += daily.previous[i] ?? 0;
            cur.push(ca);
            prv.push(pa);
            if (avg && daily.average) {
                aa += daily.average[i] ?? 0;
                avg.push(aa);
            }
        }
        const spentToDate = cur[today - 1] ?? 0;
        const projected = today > 0 ? (spentToDate / today) * pl : 0;

        const isMonthly = envelope.cadence === "monthly";
        const budget = isMonthly && total > 0 ? total : null;
        const projOver = budget != null && projected > budget;

        let foot: ReactNode;
        if (budget != null) {
            const paceNow = budget * (today / pl);
            const diff = spentToDate - paceNow;
            const under = diff <= 0;
            foot = over ? (
                <span>
                    You've spent{" "}
                    <b style={{ color: expenseC }}>
                        {money0(spentToDate - budget)} over
                    </b>{" "}
                    budget with {pl - today} day{pl - today === 1 ? "" : "s"} to go.
                </span>
            ) : (
                <span>
                    You're{" "}
                    <b style={{ color: under ? "var(--income)" : warnC }}>
                        {money0(Math.abs(diff))} {under ? "under" : "over"}
                    </b>{" "}
                    the pace line today — at this rate you'll finish at{" "}
                    <b className="tabular">{money0(projected)}</b>,{" "}
                    <b style={{ color: projOver ? expenseC : "var(--income)" }}>
                        {money0(Math.abs(projected - budget))} {projOver ? "over" : "under"}
                    </b>
                    .
                </span>
            );
        } else {
            const typicalNow = avg ? avg[today - 1] ?? 0 : 0;
            const diff = spentToDate - typicalNow;
            foot =
                avg && typicalNow > 0 ? (
                    <span>
                        You've spent <b className="tabular">{money0(spentToDate)}</b> so far —{" "}
                        <b style={{ color: diff <= 0 ? "var(--income)" : warnC }}>
                            {money0(Math.abs(diff))} {diff <= 0 ? "below" : "above"}
                        </b>{" "}
                        your typical pace by now.
                    </span>
                ) : (
                    <span>
                        Spent <b className="tabular">{money0(spentToDate)}</b> this month —
                        projected <b className="tabular">{money0(projected)}</b> by month end.
                    </span>
                );
        }

        const spendLegend: SpendChart["legend"] = [
            { label: "This period", kind: "solid", color: envelope.color },
        ];
        if (budget != null)
            spendLegend.push({
                label: "On-budget pace",
                kind: "dash",
                color: "var(--foreground)",
            });
        spendLegend.push({
            label: "Last period",
            kind: "dash",
            color: "var(--muted-foreground)",
        });
        // Only advertise "Typical" when the average line actually draws (its
        // endpoint is > 0) — an all-zero history has no visible line.
        if (avg && (avg[avg.length - 1] ?? 0) > 0)
            spendLegend.push({ label: "Typical", kind: "solid", color: "var(--income)" });

        return {
            kind: "spend",
            // Rolling envelopes show LIFETIME totals in the hero, so name the
            // month explicitly here to seam the two: this section is always
            // one month, even when the numbers above it are all-time.
            title: isMonthly
                ? `Spending pace — ${formatInAppTz(periodStart, "MMMM")}`
                : `This month's spending — ${formatInAppTz(periodStart, "MMMM")}`,
            subtitle: isMonthly
                ? "Cumulative spend vs. the pace that keeps you on budget — plus last month and your typical pace."
                : "This month only — the totals above are your all-time rolling pool.",
            legend: spendLegend,
            foot,
            race: {
                cur,
                prv,
                avg,
                today,
                daysInMonth: pl,
                projection: projected,
                bucketUnit: daily.bucketUnit,
                periodStart,
                budget,
                color: envelope.color,
                showToday: monthOffset === 0,
                ariaLabel: `Spent ${money0(spentToDate)} so far${
                    budget != null ? ` of a ${money0(budget)} budget` : ""
                }, projected ${money0(projected)} by month end.`,
                emptyLabel:
                    isMonthly && total <= 0
                        ? canEdit
                            ? "Use Allocate above to set this month's amount, then your pace charts here."
                            : "No budget set for this month yet."
                        : "No spending logged yet — it'll chart here as you use this envelope.",
            },
        };
    }, [
        envelope,
        isGoal,
        dailyQuery.data,
        total,
        over,
        goalSaved,
        goalTarget,
        periodStart,
        monthOffset,
        canEdit,
        archived,
        goalSpent,
    ]);

    // KPI strip values
    const kpis = useMemo(() => {
        if (!envelope) return null;
        if (isGoal) {
            const now = new Date();
            const start = envelope.firstAllocatedAt
                ? new Date(envelope.firstAllocatedAt)
                : now;
            const months = Math.max(daysBetween(start, now) / 30, 0.001);
            const perMonth = goalSaved / months;
            const toGo = Math.max(0, goalTarget - goalSaved);
            const pct = goalTarget > 0 ? Math.round((goalSaved / goalTarget) * 100) : 0;
            const monthsToDeadline = envelope.targetDate
                ? daysBetween(now, new Date(envelope.targetDate)) / 30
                : null;
            return [
                { label: "Avg / month", val: money0(perMonth), sub: "funded so far", tone: "fg" as const },
                { label: "% complete", val: `${pct}%`, sub: "of target", tone: "gold" as const },
                {
                    label: "Needed / mo",
                    val:
                        monthsToDeadline && monthsToDeadline > 0
                            ? money0(toGo / monthsToDeadline)
                            : "—",
                    sub: envelope.targetDate ? "to finish on time" : "no deadline",
                    tone: "fg" as const,
                },
                {
                    label: "Deadline",
                    val: envelope.targetDate
                        ? formatInAppTz(envelope.targetDate, "MMM yyyy")
                        : "—",
                    sub: envelope.targetDate ? "target date" : "none set",
                    tone: "fg" as const,
                },
            ];
        }
        const daily = dailyQuery.data;
        const spent = envelope.consumed;
        const pl = daily?.periodLength ?? 30;
        const today = daily ? Math.min(daily.today, pl) : 1;
        const projEnd = today > 0 ? (spent / today) * pl : spent;
        // Days remaining INCLUDING today (you can still spend today), so the
        // final day of the month reads "1 day left", hitting 0 only once the
        // period has rolled over. Uses the memoized `now` for consistency with
        // the rest of the page rather than a fresh Date.now().
        const daysLeft = Math.max(
            0,
            Math.ceil((periodEnd.getTime() - now.getTime()) / DAY)
        );
        const isPast = monthOffset < 0;
        const pctBudget = total > 0 ? Math.round((spent / total) * 100) : 0;
        return [
            { label: "Last month", val: averages ? money0(averages.lastMonthSpend) : "—", sub: averages && averages.lastMonthPlanned > 0 ? `${Math.round((averages.lastMonthSpend / averages.lastMonthPlanned) * 100)}% of plan` : "spent", tone: "fg" as const },
            { label: "3-month avg", val: averages ? money0(averages.avg3MonthSpend) : "—", sub: "per month", tone: "fg" as const },
            isPast
                ? { label: "% of budget", val: total > 0 ? `${pctBudget}%` : "—", sub: total > 0 ? "of the plan spent" : "no budget set", tone: total > 0 && spent > total ? "expense" as const : "fg" as const }
                : { label: "Projected end", val: daily ? money0(projEnd) : "—", sub: "at current pace", tone: daily && total > 0 && projEnd > total ? "expense" as const : "income" as const },
            isPast
                ? { label: spent > total ? "Over by" : "Left over", val: total > 0 ? money0(Math.abs(total - spent)) : "—", sub: "vs the budget", tone: total > 0 && spent > total ? "expense" as const : "income" as const }
                : { label: "Days left", val: String(daysLeft), sub: "this month", tone: "fg" as const },
        ];
    }, [envelope, isGoal, dailyQuery.data, averages, total, goalSaved, goalTarget, periodEnd, monthOffset, now]);

    // status pill for the hero
    const status = useMemo((): { label: string; tone: Tone | "income" | "fg" } | null => {
        if (!envelope) return null;
        type S = { label: string; tone: Tone | "income" | "fg" };
        let result: S;
        if (isGoal) {
            result =
                goalSaved >= goalTarget
                    ? // Fund-then-spend: once you've spent against a reached
                      // goal, "Funded" reads more truthfully than a permanent
                      // "Goal reached" while the pool drains.
                      {
                          label: goalSpent > 0 ? "Funded" : "Goal reached",
                          tone: "gold",
                      }
                    : {
                          label: `${goalTarget > 0 ? Math.round((goalSaved / goalTarget) * 100) : 0}% funded`,
                          tone: "gold",
                      };
        } else if (over) {
            result = { label: "Over budget", tone: "expense" };
        } else {
            const daily = dailyQuery.data;
            const pl = daily?.periodLength ?? 0;
            const today = daily ? Math.min(daily.today, pl) : 0;
            const projEnd = today > 0 ? (envelope.consumed / today) * pl : 0;
            // Only warn "Trending over" once the month is at least half gone
            // (an early large payment shouldn't project a scary overspend from
            // 3 days of noise) AND the projection clears budget by >10%. Orbit
            // shows overspend, it doesn't nag about a maybe.
            if (
                daily &&
                envelope.cadence === "monthly" &&
                total > 0 &&
                today / pl >= 0.5 &&
                projEnd > total * 1.1
            ) {
                result = { label: "Trending over", tone: "warn" };
            } else if (total > 0) {
                result = { label: "On track", tone: "income" };
            } else {
                result = { label: "No budget set", tone: "fg" };
            }
        }
        // Archived envelopes are frozen/read-only — never flash a red or amber
        // alarm on them. Keep the informative label, but neutralize the tone.
        if (envelope.archived && (result.tone === "expense" || result.tone === "warn")) {
            return { ...result, tone: "fg" };
        }
        return result;
    }, [envelope, isGoal, over, dailyQuery.data, total, goalSaved, goalTarget, goalSpent]);

    return (
        <div className="orbit-design ed-root">
            <style>{ED_STYLES}</style>

            {/* Topbar */}
            <header className="ed-topbar">
                <div className="ed-topbar-text">
                    <span className="eyebrow ed-breadcrumb">
                        <Link to={ROUTES.spaceBudgets(space.id)} className="ed-crumb">
                            Budgets
                        </Link>
                        <ChevronRight className="size-3" style={{ color: "var(--fg-4)" }} />{" "}
                        <span style={{ color: "var(--fg-2)" }}>
                            {envelope?.name ?? "Loading…"}
                        </span>
                    </span>
                    <h1 className="display ed-title">
                        {envelope ? (
                            <>
                                <Avatar icon={envelope.icon} color={envelope.color} size={36} />
                                {envelope.name}
                                {envelope.archived && (
                                    <span className="ed-archived-badge">Archived</span>
                                )}
                            </>
                        ) : (
                            "Envelope"
                        )}
                    </h1>
                    <p className="ed-sub">
                        {envelope
                            ? `${isGoal ? "Goal" : envelope.cadence === "monthly" ? "Monthly" : "Rolling"}${
                                  envelope.description ? ` · ${envelope.description}` : ""
                              }`
                            : "Utilization and recent activity"}
                    </p>
                </div>
                <div className="ed-topbar-actions">
                    {/* Month stepper — only for monthly envelopes, where the
                        whole page re-prices per month. Rolling/goal envelopes
                        are a single lifetime pool (their hero can't move with
                        the month), so a stepper there would disagree with
                        itself. */}
                    {envelope && envelope.cadence === "monthly" && (
                        <div className="ed-month-nav" role="group" aria-label="Month">
                            <button
                                type="button"
                                className="ed-mo-arrow"
                                onClick={() => setMonthOffset((m) => m - 1)}
                                aria-label="Previous month"
                            >
                                <ChevronLeft className="size-3.5" />
                            </button>
                            <span className="ed-mo-label">{monthLabel}</span>
                            <button
                                type="button"
                                className="ed-mo-arrow"
                                onClick={() => setMonthOffset((m) => Math.min(0, m + 1))}
                                disabled={monthOffset >= 0}
                                aria-label="Next month"
                            >
                                <ChevronRight className="size-3.5" />
                            </button>
                        </div>
                    )}
                    {envelope && !envelope.archived && (
                        <PermissionGate roles={["owner", "editor"]}>
                            <EnvelopeAllocateDialog
                                envelopId={envelope.envelopId}
                                envelopCadence={envelope.cadence}
                                direction="allocate"
                                trigger={<button type="button" className="od-btn">Allocate</button>}
                            />
                            <EnvelopeAllocateDialog
                                envelopId={envelope.envelopId}
                                envelopCadence={envelope.cadence}
                                direction="deallocate"
                                trigger={<button type="button" className="od-btn">Deallocate</button>}
                            />
                            <EnvelopeTopUpDialog
                                envelopId={envelope.envelopId}
                                envelopeName={envelope.name}
                                envelopeColor={envelope.color}
                                trigger={
                                    <button type="button" className="od-btn">
                                        <Coins className="size-3.5" /> Top up…
                                    </button>
                                }
                            />
                            <EnvelopeMoveDialog
                                sourceEnvelopId={envelope.envelopId}
                                sourceEnvelopeName={envelope.name}
                                sourceEnvelopeColor={envelope.color}
                                trigger={
                                    <button type="button" className="od-btn">
                                        <ArrowRightLeft className="size-3.5" /> Move to…
                                    </button>
                                }
                            />
                        </PermissionGate>
                    )}
                    {envelope?.archived && envelope.remaining > 0 && (
                        <PermissionGate roles={["owner", "editor"]}>
                            <EnvelopeAllocateDialog
                                envelopId={envelope.envelopId}
                                envelopCadence={envelope.cadence}
                                direction="deallocate"
                                trigger={<button type="button" className="od-btn">Free trapped cash</button>}
                            />
                        </PermissionGate>
                    )}
                    {envelope?.archived && (
                        <PermissionGate roles={["owner"]}>
                            <UnarchiveButton envelopId={envelope.envelopId} spaceId={space.id} />
                        </PermissionGate>
                    )}
                    {envelope && !envelope.archived && (
                        <PermissionGate roles={["owner"]}>
                            <button
                                type="button"
                                className="od-btn od-btn-primary"
                                onClick={() => setEditOpen(true)}
                            >
                                <Pencil className="size-3.5" /> Edit
                            </button>
                            <CreateOrEditEnvelopeDialog
                                envelope={{
                                    envelopId: envelope.envelopId,
                                    name: envelope.name,
                                    color: envelope.color,
                                    icon: envelope.icon,
                                    description: envelope.description,
                                    cadence: envelope.cadence,
                                    targetAmount: envelope.targetAmount,
                                    targetDate: envelope.targetDate,
                                }}
                                open={editOpen}
                                onOpenChange={setEditOpen}
                                hideDefaultTrigger
                            />
                        </PermissionGate>
                    )}
                </div>
            </header>

            <div className="ed-scroll">
                {/* Hero: glass + numbers */}
                {envelope ? (
                    <section className="od-card ed-hero">
                        <div className="ed-hero-glass">
                            <EnvelopeGlass
                                variant={isGoal ? "save" : "spend"}
                                current={isGoal ? goalSaved : envelope.consumed}
                                total={isGoal ? goalTarget : total}
                                height={168}
                                color={envelope.color}
                            />
                        </div>
                        <div className="ed-hero-body">
                            <div className="ed-hero-nums">
                                {isGoal ? (
                                    <>
                                        <HeroNum label="Saved" value={goalSaved} tone="gold" />
                                        <span className="ed-hero-div" />
                                        <HeroNum label="Target" value={goalTarget} tone="fg" />
                                        <span className="ed-hero-div" />
                                        {goalSpent > 0 ? (
                                            <HeroNum
                                                label="Spent"
                                                value={goalSpent}
                                                tone="fg"
                                            />
                                        ) : (
                                            <HeroNum
                                                label="To go"
                                                value={Math.max(0, goalTarget - goalSaved)}
                                                tone="fg"
                                            />
                                        )}
                                    </>
                                ) : noBudget ? (
                                    <>
                                        <HeroNum label="Spent" value={envelope.consumed} tone="fg" />
                                        <span className="ed-hero-div" />
                                        <HeroNum label="Allocated" value={0} tone="fg" />
                                    </>
                                ) : (
                                    <>
                                        <HeroNum
                                            label={over ? "Over by" : "Remaining"}
                                            value={Math.abs(remaining)}
                                            tone={muteTone(over ? "expense" : "gold")}
                                        />
                                        <span className="ed-hero-div" />
                                        <HeroNum label="Spent" value={envelope.consumed} tone="brand" />
                                        <span className="ed-hero-div" />
                                        <HeroNum label="Allocated" value={total} tone="fg" />
                                    </>
                                )}
                            </div>
                            {status && (
                                <div className="ed-hero-status">
                                    {(() => {
                                        const pillColor =
                                            status.tone === "income"
                                                ? "var(--income)"
                                                : status.tone === "fg"
                                                  ? "var(--fg-3)"
                                                  : toneVar[status.tone];
                                        return (
                                    <span
                                        className="ed-pill"
                                        style={{
                                            color: pillColor,
                                            background: `color-mix(in oklab, ${pillColor} 12%, transparent)`,
                                            borderColor: `color-mix(in oklab, ${pillColor} 28%, transparent)`,
                                        }}
                                    >
                                        {status.label}
                                    </span>
                                        );
                                    })()}
                                    <span className="ed-status-note">
                                        {isGoal
                                            ? envelope.targetDate
                                                ? `Target by ${formatInAppTz(envelope.targetDate, "MMM d, yyyy")}`
                                                : "No deadline set"
                                            : envelope.cadence === "monthly"
                                              ? `${monthLabel}`
                                              : "Rolling · lifetime total"}
                                    </span>
                                </div>
                            )}
                        </div>
                        {kpis && (
                            <div className="ed-hero-facts">
                                {kpis.map((k) => (
                                    <div key={k.label} className="ed-fact">
                                        <span className="ed-fact-label">{k.label}</span>
                                        <span
                                            className="ed-fact-val tabular"
                                            style={{ color: factColor(muteTone(k.tone)) }}
                                        >
                                            {k.val}
                                        </span>
                                        <span className="ed-fact-sub">{k.sub}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                ) : utilizationQuery.isLoading ? (
                    <Skeleton height={200} />
                ) : (
                    <div className="od-card ed-hero">
                        <p style={{ color: "var(--fg-3)", fontSize: 13 }}>
                            This envelope no longer exists.{" "}
                            <Link to={ROUTES.spaceBudgets(space.id)} className="ed-crumb">
                                Back to budgets
                            </Link>
                        </p>
                    </div>
                )}

                {/* Pace chart */}
                {envelope && (
                    <section className="od-card ed-chart">
                        <div className="ed-sect-head">
                            <div className="ed-sect-text">
                                <h2 className="display ed-sect-title">{chart?.title ?? "Spending pace"}</h2>
                                <span className="ed-sect-sub">{chart?.subtitle ?? ""}</span>
                            </div>
                            {chart?.legend && (
                                <div className="ed-legend">
                                    {chart.legend.map((l) => (
                                        <span key={l.label}>
                                            <i
                                                className={`ed-sw ed-sw-${l.kind}`}
                                                style={
                                                    l.kind === "solid"
                                                        ? { background: l.color }
                                                        : ({ ["--c" as never]: l.color } as CSSProperties)
                                                }
                                            />
                                            {l.label}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        {chart?.kind === "goal" ? (
                            <>
                                <div className="ed-chart-wrap">
                                    <EnvelopePaceChart {...chart.props} />
                                </div>
                                <div className="ed-chart-foot">{chart.foot}</div>
                            </>
                        ) : chart?.kind === "spend" ? (
                            <>
                                <div className="ed-chart-wrap">
                                    <EnvelopeSpendChart {...chart.race} />
                                </div>
                                <div className="ed-chart-foot">{chart.foot}</div>
                            </>
                        ) : dailyQuery.isLoading && !isGoal ? (
                            <Skeleton height={240} />
                        ) : (
                            <div className="ed-empty">
                                {total > 0
                                    ? "Spending will chart here as you log transactions."
                                    : canEdit
                                      ? "Use Allocate above to set an amount, then this pace chart fills in as you spend."
                                      : "No budget set for this envelope yet."}
                            </div>
                        )}
                    </section>
                )}

                {/* Where it went — this envelope's spend split across its
                    categories for the period (reuses the analytics Donut). */}
                {envelope && (
                    <section className="od-card ed-section">
                        <div className="ed-sect-head">
                            <div className="ed-sect-text">
                                <h2 className="display ed-sect-title">Where it went</h2>
                                <span className="ed-sect-sub">
                                    {envelope.cadence === "monthly"
                                        ? `Spend by category · ${monthLabel}`
                                        : "Spend by category this month"}
                                </span>
                            </div>
                        </div>
                        {catQuery.isLoading ? (
                            <Skeleton height={280} />
                        ) : catData.length === 0 ? (
                            <div className="ed-empty">
                                {monthOffset < 0
                                    ? `No spending in this envelope in ${monthLabel}.`
                                    : "No spending logged yet — it'll break down by category here as you use this envelope."}
                            </div>
                        ) : (
                            <div className="ed-cat-wrap">
                                <div className="ed-cat-chart">
                                    <Donut
                                        data={donutSlices}
                                        centerLabel="Spent"
                                        centerValue={catTotal}
                                        height={260}
                                        hideLegend
                                    />
                                </div>
                                <div className="ed-cat-legend">
                                    {catData.map((d) => {
                                        const pct =
                                            catTotal > 0
                                                ? Math.round((d.value / catTotal) * 100)
                                                : 0;
                                        return (
                                            <div key={d.id} className="ed-cat-row">
                                                <span
                                                    className="ed-cat-dot"
                                                    style={{ background: d.color }}
                                                />
                                                <span className="ed-cat-name" title={d.name}>
                                                    {d.name}
                                                </span>
                                                <span className="ed-cat-val tabular">
                                                    {money0(d.value)}
                                                    <span className="ed-cat-pct">{pct}%</span>
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </section>
                )}
            </div>
        </div>
    );
}

/** A small set of "nice" gridline values for [0, yMax]. Bounded to ~5 ticks
 * (never loops on tiny/fractional targets) and no rounding (so sub-unit
 * targets don't collapse to duplicate zeros — fmtY handles display). */
function niceTicks(yMax: number): number[] {
    if (!(yMax > 0)) return [0];
    const step = niceStep(yMax / 4);
    if (!(step > 0)) return [0, yMax];
    const ticks: number[] = [];
    for (let v = 0; v <= yMax + step * 0.001 && ticks.length < 8; v += step) {
        ticks.push(v);
    }
    return ticks;
}
function niceStep(raw: number): number {
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return nice * mag;
}

function factColor(tone: string): string {
    return tone === "brand"
        ? "var(--brand)"
        : tone === "gold"
          ? "var(--gold)"
          : tone === "expense"
            ? "var(--expense)"
            : tone === "income"
              ? "var(--income)"
              : "var(--fg)";
}

function HeroNum({
    label,
    value,
    tone,
}: {
    label: string;
    value: number;
    tone: Tone | "fg";
}) {
    const color =
        tone === "fg"
            ? "var(--fg)"
            : tone === "brand"
              ? "var(--brand)"
              : tone === "gold"
                ? "var(--gold)"
                : tone === "expense"
                  ? "var(--expense)"
                  : "var(--warn)";
    return (
        <div className="ed-hero-num">
            <span className="ed-hero-num-label">{label}</span>
            <span className="ed-hero-num-val tabular" style={{ color }}>
                {money2(value)}
            </span>
        </div>
    );
}

function UnarchiveButton({ envelopId, spaceId }: { envelopId: string; spaceId: string }) {
    const utils = trpc.useUtils();
    const mutation = trpc.envelop.archive.useMutation({
        onSuccess: async () => {
            toast.success("Unarchived");
            await Promise.all([
                utils.envelop.listBySpace.invalidate({ spaceId }),
                utils.analytics.envelopeUtilization.invalidate({ spaceId }),
                utils.analytics.spaceSummary.invalidate(),
            ]);
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <button
            type="button"
            className="od-btn od-btn-primary"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ envelopId, archived: false })}
        >
            <ArchiveRestore className="size-3.5" />
            {mutation.isPending ? "Unarchiving…" : "Unarchive"}
        </button>
    );
}

function Avatar({ icon, color, size = 32 }: { icon: string; color: string; size?: number }) {
    const IconCmp = getIcon(icon);
    return (
        <span
            style={{
                width: size,
                height: size,
                borderRadius: 8,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: `color-mix(in oklab, ${color} 18%, transparent)`,
                border: `1px solid color-mix(in oklab, ${color} 30%, transparent)`,
                color: color,
                flexShrink: 0,
            }}
        >
            <IconCmp size={size * 0.5} color={color} strokeWidth={1.7} />
        </span>
    );
}

function Skeleton({ height = 16 }: { height?: number }) {
    return (
        <div
            style={{
                width: "100%",
                height,
                borderRadius: 12,
                background:
                    "linear-gradient(90deg, var(--bg-elev-1), var(--bg-elev-2), var(--bg-elev-1))",
                backgroundSize: "200% 100%",
                animation: "ov-shimmer 1.6s ease-in-out infinite",
            }}
        />
    );
}

const ED_STYLES = `
.ed-root {
    margin: -1.5rem -1rem;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
}
@media (min-width: 768px) { .ed-root { margin: -2rem; } }

.ed-topbar {
    padding: 26px 32px 18px;
    border-bottom: 1px solid var(--line-soft);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    background: var(--bg);
    flex-wrap: wrap;
}
.ed-topbar-text { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ed-breadcrumb { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; }
.ed-crumb { color: var(--fg-3); text-decoration: none; transition: color 140ms ease; border-radius: 6px; }
.ed-crumb:hover { color: var(--fg); }
.ed-crumb:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; }
.ed-title {
    font-size: 26px; font-weight: 500; letter-spacing: -0.02em; color: var(--fg);
    margin: 0; display: inline-flex; align-items: center; gap: 14px;
}
.ed-sub { font-size: 13px; color: var(--fg-3); margin: 0; }
.ed-archived-badge {
    display: inline-flex; align-items: center; height: 20px; padding: 0 8px; margin-left: 10px;
    border-radius: 999px; background: var(--bg-elev-3); color: var(--fg-3);
    font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; vertical-align: middle;
}
.ed-topbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
/* Month stepper — browse this envelope across months. */
.ed-month-nav {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 34px;
    padding: 0 4px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--bg-elev-1);
    margin-right: 4px;
}
.ed-mo-arrow {
    width: 34px;
    height: 34px;
    border-radius: 7px;
    display: grid;
    place-items: center;
    background: transparent;
    border: 0;
    color: var(--fg-3);
    cursor: pointer;
    transition: background 140ms ease, color 140ms ease;
}
.ed-mo-arrow:hover:not(:disabled) { background: var(--bg-elev-2); color: var(--fg); }
.ed-mo-arrow:disabled { opacity: 0.4; cursor: not-allowed; }
.ed-mo-arrow:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
@media (max-width: 640px) { .ed-mo-arrow { width: 44px; height: 44px; } }
.ed-mo-label {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--fg);
    min-width: 82px;
    text-align: center;
    font-variant-numeric: tabular-nums;
}
@media (max-width: 720px) { .ed-topbar { padding: 18px 18px 14px; } }

.ed-scroll {
    flex: 1;
    padding: 22px 32px 40px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
}
@media (max-width: 720px) { .ed-scroll { padding: 16px 18px 28px; } }

/* Hero */
.orbit-design .od-card.ed-hero {
    padding: 22px 24px;
    display: flex;
    align-items: center;
    gap: 28px;
    flex-wrap: wrap;
}
.ed-hero-glass { flex: 0 0 auto; }
.ed-hero-body { flex: 1 1 240px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.ed-hero-nums { display: flex; align-items: center; gap: 26px; flex-wrap: wrap; }
.ed-hero-num { display: flex; flex-direction: column; gap: 3px; }
.ed-hero-num-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.09em; color: var(--fg-3); font-weight: 500; }
.ed-hero-num-val { font-size: 30px; font-weight: 500; letter-spacing: -0.03em; }
.ed-hero-div { width: 1px; align-self: stretch; min-height: 42px; background: var(--line-soft); }
@media (max-width: 520px) { .ed-hero-div { display: none; } .ed-hero-nums { gap: 18px; } }
.ed-hero-status { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.ed-pill { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; border: 1px solid transparent; }
.ed-status-note { font-size: 12.5px; color: var(--fg-3); }
/* Secondary facts, right side of the hero — fills the space that was empty
   and consolidates the old separate KPI strip. */
.ed-hero-facts {
    flex: 1 1 300px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px 32px;
    align-self: stretch;
    align-content: center;
    padding-left: 28px;
    border-left: 1px solid var(--line-soft);
}
.ed-fact { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ed-fact-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg-3); font-weight: 500; }
.ed-fact-val { font-size: 19px; font-weight: 500; letter-spacing: -0.02em; }
.ed-fact-sub { font-size: 10.5px; color: var(--fg-3); }
@media (max-width: 900px) {
    .ed-hero-facts { padding-left: 0; border-left: none; flex-basis: 100%; }
}

/* Chart */
.orbit-design .od-card.ed-chart { padding: 20px 22px 16px; }
.ed-chart-wrap { width: 100%; }
.ed-chart-foot {
    margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line-soft);
    font-size: 12.5px; color: var(--fg-3);
}
.ed-chart-foot b { font-weight: 600; color: var(--fg); }
.ed-legend { display: flex; gap: 14px; font-size: 11.5px; color: var(--fg-3); flex-wrap: wrap; }
.ed-legend span { display: inline-flex; align-items: center; gap: 6px; }
.ed-sw { width: 14px; height: 3px; border-radius: 2px; }
.ed-sw-dash { height: 0; border-top: 2px dashed var(--c); }
.ed-sw-dot { height: 0; border-top: 2px dotted var(--c); }


/* Sections */
.ed-section { padding: 20px 22px; }
.ed-sect-head {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px; margin-bottom: 14px; flex-wrap: wrap;
}
.ed-sect-text { display: flex; flex-direction: column; gap: 2px; }
.ed-sect-title { font-size: 16px; font-weight: 500; letter-spacing: -0.01em; color: var(--fg); margin: 0; }
.ed-sect-sub { font-size: 12px; color: var(--fg-3); }

.ed-empty { padding: 30px 0; text-align: center; color: var(--fg-3); font-size: 13px; }

/* Where it went — donut left, a two-column legend filling the width right. */
.ed-cat-wrap { display: flex; align-items: flex-start; gap: 36px; flex-wrap: wrap; }
.ed-cat-chart { flex: 0 0 260px; max-width: 100%; position: sticky; top: 16px; }
.ed-cat-legend {
    flex: 1 1 360px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 36px;
    align-content: center;
}
@media (max-width: 640px) {
    .ed-cat-legend { grid-template-columns: 1fr; }
    .ed-cat-chart { position: static; }
}
.ed-cat-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 5px 0;
    border-bottom: 1px solid var(--line-soft);
}
.ed-cat-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.ed-cat-name {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 13px;
    color: var(--fg-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ed-cat-val {
    flex: 0 0 auto;
    font-size: 13px;
    font-weight: 500;
    color: var(--fg);
    white-space: nowrap;
}
.ed-cat-pct { color: var(--fg-3); margin-left: 8px; font-size: 11.5px; font-weight: 400; }

@media (max-width: 640px) {
    .ed-topbar { padding: 14px 14px 10px; }
    .ed-title { font-size: 20px; gap: 10px; }
    .ed-scroll { padding: 12px 14px 22px; gap: 12px; }
    .orbit-design .od-card.ed-hero { padding: 16px; gap: 18px; }
    .ed-hero-num-val { font-size: 26px; }
    .orbit-design .od-card.ed-chart { padding: 16px; }
    .ed-section { padding: 14px; }
    .ed-sect-head { margin-bottom: 10px; }
    /* This is the densest button cluster on the page — give the wrapped
       action buttons a full 44px touch target on mobile. */
    .ed-topbar-actions .od-btn { min-height: 44px; }
}
`;
