import { useMemo, useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Save, ArrowLeft, Unlock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import {
    startOfMonth,
    endOfMonth,
    addMonths,
    makeAppTzDate,
    getAppTzYear,
    getAppTzMonth,
} from "@/lib/dates";
import { formatInAppTz } from "@/lib/formatDate";
import { compactMoney } from "@/lib/chartBucket";
import type { RouterOutput } from "@/trpc";

type EnvRow = RouterOutput["analytics"]["envelopeUtilization"][number];

function parseMonthSlug(s: string | undefined): Date {
    if (!s) return startOfMonth(new Date());
    const m = /^(\d{4})-(\d{2})$/.exec(s);
    if (!m) return startOfMonth(new Date());
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    // Construct the month-start in APP_TZ so the displayed/edited month
    // matches the slug for users in any browser timezone (native
    // `new Date(y, m, 1)` would drift for users east of APP_TZ).
    return makeAppTzDate(year, month, 1);
}

function monthSlug(d: Date): string {
    return `${getAppTzYear(d)}-${String(getAppTzMonth(d) + 1).padStart(2, "0")}`;
}

export default function BudgetMonthPage() {
    const { space } = useCurrentSpace();
    const { month } = useParams<{ month: string }>();
    const navigate = useNavigate();

    const monthDate = useMemo(() => parseMonthSlug(month), [month]);
    const periodStart = useMemo(() => startOfMonth(monthDate), [monthDate]);
    const periodEnd = useMemo(() => endOfMonth(monthDate), [monthDate]);
    const prevDate = useMemo(() => addMonths(monthDate, -1), [monthDate]);
    const prevPeriodStart = useMemo(() => startOfMonth(prevDate), [prevDate]);
    const prevPeriodEnd = useMemo(() => endOfMonth(prevDate), [prevDate]);

    // Format in APP_TZ so the label matches the APP_TZ-constructed month
    // for users in any browser timezone (native toLocaleString would render
    // the previous month for browsers west of APP_TZ).
    const monthLabel = formatInAppTz(monthDate, "MMMM yyyy");
    const prevMonthLabel = formatInAppTz(prevDate, "MMM");

    const currentQuery = trpc.analytics.envelopeUtilization.useQuery({
        spaceId: space.id,
        periodStart,
        periodEnd,
    });

    const prevQuery = trpc.analytics.envelopeUtilization.useQuery({
        spaceId: space.id,
        periodStart: prevPeriodStart,
        periodEnd: prevPeriodEnd,
    });

    const summaryQuery = trpc.analytics.spaceSummary.useQuery({
        spaceId: space.id,
        periodStart,
        periodEnd,
    });

    const recentAvgQuery = trpc.analytics.envelopeRecentAverages.useQuery({
        spaceId: space.id,
        referenceDate: periodStart,
    });
    const recentByEnvelopeId = useMemo(() => {
        const m = new Map<
            string,
            {
                lastMonthSpend: number;
                lastMonthPlanned: number;
                avg3MonthSpend: number;
            }
        >();
        for (const r of recentAvgQuery.data ?? []) {
            m.set(r.envelopId, {
                lastMonthSpend: r.lastMonthSpend,
                lastMonthPlanned: r.lastMonthPlanned,
                avg3MonthSpend: r.avg3MonthSpend,
            });
        }
        return m;
    }, [recentAvgQuery.data]);

    const utils = trpc.useUtils();
    const allocate = trpc.envelop.allocationCreate.useMutation();

    // Comparable month ordinal so we can decide past / current / future
    // cleanly across year boundaries (string compare on "YYYY-M" doesn't
    // sort right when months go single → double digit).
    const monthOrdinal = getAppTzYear(monthDate) * 12 + getAppTzMonth(monthDate);
    const nowOrdinal = (() => {
        const d = new Date();
        return getAppTzYear(d) * 12 + getAppTzMonth(d);
    })();
    const isCurrentMonth = monthOrdinal === nowOrdinal;
    const isPast = monthOrdinal < nowOrdinal;
    const [unlocked, setUnlocked] = useState(false);
    const isLocked = isPast && !unlocked;
    // Past months are review-only by default. Editing them silently rewrites
    // history: changes "spent vs allocated" charts retroactively. Lock the
    // inputs to avoid the foot-gun. The current and future months remain
    // editable.
    //
    // The user can explicitly opt out of the lock via the unlock button —
    // see the lock banner below. `isLocked` is the single source of truth
    // downstream; `isPast` continues to govern review-vs-planning copy.

    // Envelopes filtered to monthly cadence — the start-of-month ritual is
    // for repeating monthly buckets. Rolling envelopes (cadence='none') are
    // lifetime pools and live on the Envelopes page instead.
    //
    // Archived envelopes: excluded from current/future planning (you can't
    // allocate to them anyway — server blocks it). Past-month review keeps
    // them so historical data renders correctly.
    const envelopes: EnvRow[] = useMemo(
        () =>
            (currentQuery.data ?? []).filter(
                (e) => e.cadence === "monthly" && (isPast || !e.archived)
            ),
        [currentQuery.data, isPast]
    );

    // Map prev-month envelope rows by id for quick lookup.
    const prevById = useMemo(() => {
        const map = new Map<string, EnvRow>();
        for (const e of prevQuery.data ?? []) map.set(e.envelopId, e);
        return map;
    }, [prevQuery.data]);

    // Editable plan amounts keyed by envelope id. Re-hydrated whenever the
    // viewed month changes (so navigation refreshes the inputs) or after a
    // save (so the deltas reflect the new server state). Within a stable
    // month + draft session we don't auto-overwrite the user's edits on
    // background refetches.
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [hydrated, setHydrated] = useState(false);

    const monthKey = `${getAppTzYear(monthDate)}-${getAppTzMonth(monthDate)}`;
    useEffect(() => {
        // Reset hydration whenever the month changes; the next effect picks
        // up fresh data and hydrates again.
        setHydrated(false);
        setDrafts({});
        setUnlocked(false);
    }, [monthKey]);

    useEffect(() => {
        if (!hydrated && envelopes.length > 0) {
            const next: Record<string, string> = {};
            for (const e of envelopes) next[e.envelopId] = e.allocated.toFixed(2);
            setDrafts(next);
            setHydrated(true);
        }
    }, [envelopes, hydrated]);

    const totalPlanned = useMemo(() => {
        return envelopes.reduce((s, e) => s + (Number(drafts[e.envelopId]) || 0), 0);
    }, [envelopes, drafts]);

    const totalCurrentlyAllocated = useMemo(
        () => envelopes.reduce((s, e) => s + e.allocated, 0),
        [envelopes]
    );

    const netChange = totalPlanned - totalCurrentlyAllocated;

    // The Unbudgeted pool only drains by the part of a new allocation that
    // actually HOLDS cash — the increase in max(0, allocated − consumed) —
    // mirroring the server's clamped formula (Unbudgeted = spendable −
    // Σ max(0, allocated − consumed)). Allocation that merely covers past
    // overspend (consumed already ≥ allocated) holds nothing and leaves the
    // pool untouched. A flat planned − allocated delta over-drains whenever an
    // overspent envelope is in scope, falsely showing less "Free after save"
    // or a phantom "Over-budgeted by". (Only monthly envelopes are editable
    // here, so summing held deltas over `envelopes` covers everything that can
    // change; rolling envelopes' held is unaffected.)
    const heldDelta = useMemo(
        () =>
            envelopes.reduce((s, e) => {
                const planned = Number(drafts[e.envelopId]) || 0;
                const plannedHeld = Math.max(0, planned - e.consumed);
                const currentHeld = Math.max(0, e.allocated - e.consumed);
                return s + (plannedHeld - currentHeld);
            }, 0),
        [envelopes, drafts]
    );
    const unallocatedNow = summaryQuery.data?.unallocated ?? 0;
    const unallocatedAfterSave = unallocatedNow - heldDelta;
    const overplanning = unallocatedAfterSave < -0.005;

    const [saving, setSaving] = useState(false);

    const onSave = async () => {
        if (saving) return;
        setSaving(true);
        const errors: string[] = [];
        const successes: string[] = [];
        for (const e of envelopes) {
            const target = Number(drafts[e.envelopId]);
            if (!Number.isFinite(target) || target < 0) continue;
            const delta = +(target - e.allocated).toFixed(2);
            if (delta === 0) continue;
            try {
                await allocate.mutateAsync({
                    envelopId: e.envelopId,
                    amount: delta,
                    periodStart,
                    // Fresh idempotency key per row per attempt. If the
                    // user double-fires Save, each row's second call
                    // hits the cached result instead of double-allocating.
                    idempotencyKey: crypto.randomUUID(),
                });
                successes.push(e.name);
            } catch (err) {
                errors.push(`${e.name}: ${(err as Error).message ?? "unknown error"}`);
            }
        }
        await Promise.all([
            utils.envelop.allocationListBySpace.invalidate({ spaceId: space.id }),
            utils.analytics.envelopeUtilization.invalidate({ spaceId: space.id }),
            utils.analytics.spaceSummary.invalidate(),
        ]);
        setSaving(false);
        if (errors.length === 0) {
            toast.success(
                successes.length === 0
                    ? "Nothing to save"
                    : `Saved ${successes.length} envelope${successes.length === 1 ? "" : "s"}`
            );
            navigate(ROUTES.spaceBudgets(space.id));
        } else {
            // Partial save: the server state has moved for the successful
            // ones. Reset hydration so drafts re-sync from the refreshed
            // utilization query — otherwise deltas keep showing stale
            // pre-save numbers and the user can't tell what's left to retry.
            setHydrated(false);
            toast.error(
                `Saved ${successes.length}, ${errors.length} failed: ${errors.slice(0, 2).join("; ")}`
            );
        }
    };

    const isLoading = currentQuery.isLoading || prevQuery.isLoading;

    return (
        <div className="orbit-design plan-root">
            <style>{PLAN_STYLES}</style>

            <header className="plan-topbar">
                <div className="plan-topbar-text">
                    <Link to={ROUTES.spaceBudgets(space.id)} className="plan-back">
                        <ArrowLeft className="size-3.5" /> Budgets
                    </Link>
                    <h1 className="display plan-title">
                        {isLocked
                            ? `Review ${monthLabel}`
                            : isPast
                              ? `Reconcile ${monthLabel}`
                              : `Budget ${monthLabel}`}
                    </h1>
                    <p className="plan-sub">
                        {isLocked
                            ? "Past month — view only. Each month's budget is independent, so editing it won't affect any other month."
                            : isPast
                              ? // The reconcile strip below owns the full
                                // overwrite/independence warning — don't
                                // repeat it here in slightly different words.
                                "Reconciliation mode. Adjust what you actually budgeted for this month — see the note below before saving."
                              : "Set what you intend to spend on each envelope. The whole month in one screen."}
                    </p>
                </div>
                <div className="plan-topbar-actions">
                    <Link
                        to={ROUTES.spaceBudgetMonth(space.id, monthSlug(addMonths(monthDate, -1)))}
                        className="od-btn"
                        title={`Go to ${formatInAppTz(addMonths(monthDate, -1), "MMMM yyyy")}`}
                    >
                        <ChevronLeft className="size-3.5" />{" "}
                        {formatInAppTz(addMonths(monthDate, -1), "MMM")}
                    </Link>
                    {!isCurrentMonth && (
                        <Link
                            to={ROUTES.spaceBudgetMonth(space.id, monthSlug(new Date()))}
                            className="od-btn"
                            title="Jump to the current month"
                        >
                            Today
                        </Link>
                    )}
                    <Link
                        to={ROUTES.spaceBudgetMonth(space.id, monthSlug(addMonths(monthDate, 1)))}
                        className="od-btn"
                        title={`Go to ${formatInAppTz(addMonths(monthDate, 1), "MMMM yyyy")}`}
                    >
                        {formatInAppTz(addMonths(monthDate, 1), "MMM")}{" "}
                        <ChevronRight className="size-3.5" />
                    </Link>
                    {isLocked ? (
                        <>
                            <span className="plan-readonly-badge">View only</span>
                            {envelopes.length > 0 && (
                                <button
                                    type="button"
                                    className="od-btn"
                                    onClick={() => setUnlocked(true)}
                                    title="Edit allocations for this past month"
                                >
                                    <Unlock className="size-3.5" aria-hidden />
                                    Reconcile
                                </button>
                            )}
                        </>
                    ) : (
                        <button
                            type="button"
                            className="od-btn od-btn-primary"
                            onClick={onSave}
                            disabled={saving || !hydrated}
                        >
                            <Save className="size-3.5" aria-hidden />
                            {saving
                                ? "Saving…"
                                : isPast && unlocked
                                  ? "Save reconciliation"
                                  : "Save budget"}
                        </button>
                    )}
                </div>
            </header>

            <div className="plan-scroll">
                {isPast && unlocked && (
                    <div
                        className="plan-reconcile-strip"
                        role="note"
                        aria-label="Reconciliation mode warning"
                    >
                        <AlertTriangle className="size-3.5" aria-hidden />
                        <span>
                            <strong>Reconciliation mode.</strong> Saving overwrites this month's
                            budget. Each month is independent — no other month is affected.
                        </span>
                        <button
                            type="button"
                            className="plan-reconcile-cancel"
                            onClick={() => {
                                // Leave reconcile mode and force the hydrate
                                // effect to repopulate drafts from current
                                // server state. Don't clear drafts directly —
                                // a `setDrafts({})` here silently destroys
                                // the user's typed values; the rehydrate path
                                // resets them cleanly without that surprise.
                                setUnlocked(false);
                                setHydrated(false);
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                )}
                {/* Hero — the page's one tension made visual: what you're
                    planning vs what you actually have, live as you type.
                    The distribution bar shows every envelope's plan as a
                    colored segment; segments crossing the "cash you have"
                    marker = over-budgeting, readable as a shape. */}
                <div className="od-card plan-hero">
                    <div className="plan-hero-top">
                        {isCurrentMonth && !isLocked ? (
                            <div className="plan-hero-primary">
                                {/* Until the summary loads AND drafts hydrate,
                                    the verdict would be computed against a zero
                                    balance / empty drafts (heldDelta releases
                                    every envelope's held cash → an inflated
                                    "Free after save") — show a neutral
                                    placeholder, not a wrong number. Zero
                                    envelopes never hydrate, so don't wait on
                                    it then. */}
                                {(() => {
                                    const heroReady =
                                        summaryQuery.data != null &&
                                        (hydrated || envelopes.length === 0);
                                    return (
                                        <>
                                            <span className="eyebrow">
                                                {!heroReady
                                                    ? "Free after save"
                                                    : overplanning
                                                      ? "Over-budgeted by"
                                                      : "Free after save"}
                                            </span>
                                            <span
                                                className="tabular plan-hero-amt"
                                                style={{
                                                    color: !heroReady
                                                        ? "var(--fg-3)"
                                                        : overplanning
                                                          ? "var(--expense)"
                                                          : "var(--income)",
                                                }}
                                            >
                                                {!heroReady
                                                    ? "—"
                                                    : Math.abs(unallocatedAfterSave).toLocaleString(
                                                          "en-US",
                                                          {
                                                              minimumFractionDigits: 2,
                                                              maximumFractionDigits: 2,
                                                          }
                                                      )}
                                            </span>
                                            <span className="plan-hero-note">
                                                {!heroReady
                                                    ? "checking your balance…"
                                                    : overplanning
                                                      ? "your envelopes would hold more than your accounts have"
                                                      : "still unbudgeted after this plan"}
                                            </span>
                                        </>
                                    );
                                })()}
                            </div>
                        ) : (
                            <div className="plan-hero-primary">
                                <span className="eyebrow">
                                    {isLocked ? "Was budgeted" : "Total budgeted"}
                                </span>
                                <span className="tabular plan-hero-amt">
                                    {(isLocked
                                        ? envelopes.reduce((s, e) => s + e.allocated, 0)
                                        : totalPlanned
                                    ).toLocaleString("en-US", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </span>
                                <span className="plan-hero-note">
                                    {`across ${envelopes.length} envelope${envelopes.length === 1 ? "" : "s"}`}
                                </span>
                            </div>
                        )}
                        <div className="plan-hero-side">
                            {isCurrentMonth && !isLocked && (
                                <>
                                    <SummaryStat
                                        label="Total budgeted"
                                        value={totalPlanned}
                                        sub={`across ${envelopes.length} envelope${envelopes.length === 1 ? "" : "s"}`}
                                        // Zero envelopes never hydrate — show
                                        // the honest 0.00, not a stuck "—".
                                        loading={!hydrated && envelopes.length > 0}
                                    />
                                    <SummaryStat
                                        label="Cash you have"
                                        value={Math.max(
                                            0,
                                            summaryQuery.data?.spendableBalance ?? 0
                                        )}
                                        sub="liquid cash in your accounts"
                                        loading={summaryQuery.data == null}
                                    />
                                </>
                            )}
                            {isPast &&
                                (() => {
                                    const totalSpent = envelopes.reduce(
                                        (s, e) => s + e.consumed,
                                        0
                                    );
                                    const totalRem = envelopes.reduce((s, e) => s + e.remaining, 0);
                                    return (
                                        <>
                                            <SummaryStat
                                                label="Spent"
                                                value={totalSpent}
                                                sub="actual transactions in this period"
                                            />
                                            {isLocked ? (
                                                <SummaryStat
                                                    label={
                                                        totalRem < 0
                                                            ? "Over budget"
                                                            : "Under budget"
                                                    }
                                                    value={Math.abs(totalRem)}
                                                    tone={totalRem < 0 ? "expense" : "income"}
                                                    sub={
                                                        totalRem < 0
                                                            ? "spent more than budgeted"
                                                            : "spent less than budgeted"
                                                    }
                                                />
                                            ) : (
                                                <SummaryStat
                                                    label="Net change"
                                                    value={Math.abs(netChange)}
                                                    tone={netChange > 0 ? "expense" : "income"}
                                                    sub={
                                                        netChange > 0
                                                            ? "more planned than before"
                                                            : netChange < 0
                                                              ? "less planned than before"
                                                              : "no change yet"
                                                    }
                                                />
                                            )}
                                        </>
                                    );
                                })()}
                            {!isPast && !isCurrentMonth && (
                                <>
                                    {/* Only when the previous month has begun —
                                        2+ months ahead it's entirely future and
                                        "0.00 for reference" references nothing. */}
                                    {monthOrdinal <= nowOrdinal + 1 && (
                                        <SummaryStat
                                            label="Last month spent"
                                            value={Array.from(prevById.values())
                                                .filter((e) => e.cadence === "monthly")
                                                .reduce((s, e) => s + e.consumed, 0)}
                                            // The gate above means "last month"
                                            // is always the in-progress current
                                            // month here — say so.
                                            sub="so far, for reference"
                                        />
                                    )}
                                    <SummaryStat
                                        label="Net change"
                                        value={Math.abs(netChange)}
                                        tone={netChange > 0 ? "expense" : "income"}
                                        sub={
                                            netChange > 0
                                                ? "more planned than before"
                                                : netChange < 0
                                                  ? "less planned than before"
                                                  : "no change yet"
                                        }
                                    />
                                </>
                            )}
                        </div>
                    </div>
                    {isCurrentMonth &&
                        !isLocked &&
                        envelopes.length > 0 &&
                        (() => {
                            const funded = Math.max(0, summaryQuery.data?.spendableBalance ?? 0);
                            // Scale on the same clamped values the segments
                            // use — a typed negative draft would otherwise
                            // shrink the scale and let a segment overflow
                            // the track.
                            const clampedTotal = envelopes.reduce(
                                (s, e) => s + Math.max(0, Number(drafts[e.envelopId]) || 0),
                                0
                            );
                            const scale = Math.max(funded, clampedTotal, 1);
                            let acc = 0;
                            const segs = envelopes
                                .map((e) => {
                                    const v = Math.max(0, Number(drafts[e.envelopId]) || 0);
                                    const seg = {
                                        id: e.envelopId,
                                        left: (acc / scale) * 100,
                                        width: (v / scale) * 100,
                                        color: e.color,
                                        name: e.name,
                                        value: v,
                                    };
                                    acc += v;
                                    return seg;
                                })
                                .filter((s) => s.width > 0);
                            return (
                                <div className="plan-dist">
                                    <div className="plan-dist-bar" aria-hidden>
                                        {segs.map((s, i) => (
                                            <span
                                                key={s.id}
                                                className="plan-dist-seg"
                                                style={{
                                                    left: `${s.left}%`,
                                                    width: `${s.width}%`,
                                                    background: s.color,
                                                    // Inline, not :last-child —
                                                    // the overlay/tick spans
                                                    // render after the segments
                                                    // in this parent.
                                                    ...(i === segs.length - 1 && {
                                                        borderTopRightRadius: 7,
                                                        borderBottomRightRadius: 7,
                                                        borderRight: "none",
                                                    }),
                                                }}
                                                title={`${s.name}: ${s.value.toLocaleString(
                                                    "en-US",
                                                    {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    }
                                                )}`}
                                            />
                                        ))}
                                        {/* Overlay in the bar's OWN terms
                                            (planned vs cash) — the held-based
                                            `overplanning` verdict can stay
                                            green mid-month while segments
                                            visibly cross the tick, and the
                                            caption promises "crossing = over-
                                            budgeting". The hero owns the
                                            save verdict; the bar just shows
                                            plan vs cash. */}
                                        {funded > 0 && clampedTotal > funded && (
                                            <span
                                                className="plan-dist-over"
                                                style={{
                                                    left: `${(funded / scale) * 100}%`,
                                                    width: `${((clampedTotal - funded) / scale) * 100}%`,
                                                }}
                                            />
                                        )}
                                        {funded > 0 && (
                                            <span
                                                className="plan-dist-tick"
                                                style={{
                                                    left: `${(funded / scale) * 100}%`,
                                                }}
                                            />
                                        )}
                                    </div>
                                    <div className="plan-dist-caption">
                                        <span>Each segment is one envelope&rsquo;s plan</span>
                                        {funded > 0 && (
                                            <span className="plan-dist-caption-tick">
                                                <i aria-hidden /> cash you have (
                                                {compactMoney(funded)})
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                </div>

                {/* Envelope list */}
                {isLoading ? (
                    <div className="od-card plan-loading">Loading…</div>
                ) : envelopes.length === 0 ? (
                    <div className="od-card plan-empty">
                        No monthly envelopes yet. Create one on the envelopes page first.
                    </div>
                ) : (
                    <div className="plan-grid">
                        {envelopes.map((e) => {
                            const prev = prevById.get(e.envelopId);
                            const recent = recentByEnvelopeId.get(e.envelopId);
                            return (
                                <PlanRow
                                    key={e.envelopId}
                                    env={e}
                                    prevAllocated={prev?.allocated ?? 0}
                                    prevConsumed={prev?.consumed ?? 0}
                                    avg3MonthSpend={recent?.avg3MonthSpend ?? 0}
                                    value={drafts[e.envelopId] ?? ""}
                                    readOnly={isLocked}
                                    reconcileMode={isPast && unlocked}
                                    midLabel={
                                        isPast && unlocked
                                            ? monthLabel.split(" ")[0]
                                            : prevMonthLabel
                                    }
                                    onChange={(v) =>
                                        setDrafts((d) => ({
                                            ...d,
                                            [e.envelopId]: v,
                                        }))
                                    }
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function SummaryStat({
    label,
    value,
    sub,
    tone,
    loading,
}: {
    label: string;
    value: number;
    sub?: string;
    tone?: "expense" | "income";
    /** Render an em-dash instead of a confident 0.00 while data loads. */
    loading?: boolean;
}) {
    const color =
        tone === "expense" ? "var(--expense)" : tone === "income" ? "var(--income)" : "var(--fg)";
    return (
        <div className="plan-summary-stat">
            <span className="eyebrow">{label}</span>
            <span
                className="tabular plan-summary-amt"
                style={{ color: loading ? "var(--fg-3)" : color }}
            >
                {loading
                    ? "—"
                    : value.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                      })}
            </span>
            {sub && <span className="plan-summary-sub">{sub}</span>}
        </div>
    );
}

function PlanRow({
    env,
    prevAllocated,
    prevConsumed,
    avg3MonthSpend,
    value,
    readOnly,
    reconcileMode,
    midLabel,
    onChange,
}: {
    env: EnvRow;
    prevAllocated: number;
    prevConsumed: number;
    avg3MonthSpend: number;
    value: string;
    readOnly?: boolean;
    reconcileMode?: boolean;
    midLabel: string;
    onChange: (v: string) => void;
}) {
    // In reconciliation mode the middle column compares against THIS period's
    // actuals (the thing the user is back-allocating against) rather than the
    // prior period's reference numbers.
    const midConsumed = reconcileMode ? env.consumed : prevConsumed;
    const midAllocated = reconcileMode ? env.allocated : prevAllocated;
    const midSubSuffix = reconcileMode ? "allocated" : "planned";
    const target = Number(value) || 0;
    const delta = target - env.allocated;
    const planned = env.allocated;
    // Coaching hint: if the proposed plan is meaningfully (>10%) below
    // the user's 3-month average actual spend, surface that. Threshold
    // avoids nagging on small differences. Only when not read-only.
    // Not in reconcile mode — "will likely fall short" is a forecast, and a
    // completed month has nothing left to forecast.
    const showHint =
        !readOnly &&
        !reconcileMode &&
        avg3MonthSpend > 0 &&
        target > 0 &&
        target < avg3MonthSpend * 0.9;
    const money0 = (n: number) =>
        n.toLocaleString("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });
    return (
        <div className="od-card plan-card">
            <div className="plan-card-head">
                <span className="plan-row-dot" style={{ background: env.color }} />
                <span className="plan-card-name" title={env.name}>
                    {env.name}
                </span>
                {!reconcileMode && env.consumed > 0 && (
                    <span className="plan-card-spent tabular">spent {money0(env.consumed)}</span>
                )}
            </div>
            <div className="plan-card-ref tabular">
                {reconcileMode
                    ? `Spent ${money0(midConsumed)} of ${money0(midAllocated)} ${midSubSuffix}`
                    : `${midLabel}: spent ${money0(midConsumed)} of ${money0(midAllocated)} ${midSubSuffix}`}
                {avg3MonthSpend > 0 && !reconcileMode && (
                    <span className="plan-card-ref-avg">
                        {" · "}avg {avg3MonthSpend.toFixed(0)}/mo
                    </span>
                )}
            </div>
            {readOnly ? (
                <div className="plan-row-readonly">
                    <span className="plan-row-readonly-amt tabular">
                        {planned.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                    </span>
                    {(() => {
                        const settled = planned - env.consumed;
                        if (settled === 0) return null;
                        return (
                            <span
                                className="plan-row-readonly-net tabular"
                                style={{
                                    color: settled < 0 ? "var(--expense)" : "var(--fg-3)",
                                }}
                            >
                                {settled < 0
                                    ? `−${Math.abs(settled).toFixed(2)} over`
                                    : `${settled.toFixed(2)} unspent`}
                            </span>
                        );
                    })()}
                </div>
            ) : (
                <div className="plan-row-editor">
                    <div className="plan-row-input-wrap">
                        <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            className="plan-row-input"
                            aria-label={`${env.name} budget`}
                        />
                        {delta !== 0 && (
                            <span
                                className="plan-row-delta"
                                style={{
                                    color: delta > 0 ? "var(--income)" : "var(--expense)",
                                }}
                            >
                                {delta > 0 ? "+" : "−"}
                                {Math.abs(delta).toLocaleString("en-US", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </span>
                        )}
                    </div>
                    {/* Quick-set anchors — the three reference numbers a
                        person actually budgets from, one tap instead of
                        retyping. Chip highlights when the input matches it. */}
                    {(() => {
                        const chips = [
                            { label: midLabel, value: midConsumed },
                            {
                                label: reconcileMode ? "Current" : "Plan",
                                value: midAllocated,
                            },
                            // A forward-looking average is no anchor for
                            // recording what a finished month's budget WAS.
                            ...(reconcileMode ? [] : [{ label: "Avg", value: avg3MonthSpend }]),
                        ].filter((c) => c.value > 0);
                        if (chips.length === 0) return null;
                        return (
                            <div className="plan-row-quick">
                                {chips.map((c) => {
                                    const active = Math.abs(target - c.value) < 0.005;
                                    return (
                                        <button
                                            key={c.label}
                                            type="button"
                                            className={`plan-chip${active ? " plan-chip-active" : ""}`}
                                            onClick={() => onChange(c.value.toFixed(2))}
                                            title={`Set to ${c.label.toLowerCase() === "avg" ? "3-month average" : c.label}: ${c.value.toLocaleString(
                                                "en-US",
                                                {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                }
                                            )}`}
                                        >
                                            {c.label} <b>{compactMoney(c.value)}</b>
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })()}
                    {/* Plan-vs-reality bar: fill = what you're typing, tick =
                        last period's actual spend. Fill short of the tick =
                        planning below what actually happened. Decorative —
                        every number is already text above. */}
                    {(midConsumed > 0 || target > 0) && (
                        <div
                            className="plan-row-bar"
                            style={{
                                background: `color-mix(in oklab, ${env.color} 14%, transparent)`,
                            }}
                            aria-hidden
                        >
                            {(() => {
                                const scale = Math.max(target, midConsumed, avg3MonthSpend, 1);
                                return (
                                    <>
                                        <span
                                            className="plan-row-bar-fill"
                                            style={{
                                                width: `${(target / scale) * 100}%`,
                                                background: env.color,
                                            }}
                                        />
                                        {midConsumed > 0 && (
                                            <span
                                                className="plan-row-bar-tick"
                                                style={{
                                                    left: `${(midConsumed / scale) * 100}%`,
                                                }}
                                            />
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>
            )}
            {showHint && (
                <div className="plan-row-coach">
                    You've averaged {avg3MonthSpend.toFixed(0)}/mo over the last 3 months —{" "}
                    {target.toFixed(0)} will likely fall short.
                </div>
            )}
        </div>
    );
}

const PLAN_STYLES = `
.plan-root {
    margin: -1.5rem -1rem;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
}
@media (min-width: 768px) {
    .plan-root { margin: -2rem; }
}

.plan-topbar {
    padding: 22px 32px 16px;
    border-bottom: 1px solid var(--line-soft);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    background: var(--bg);
    flex-wrap: wrap;
}
.plan-topbar-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.plan-back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--fg-3);
    text-decoration: none;
    padding-bottom: 4px;
}
.plan-back:hover { color: var(--fg); }
.plan-title {
    font-size: 24px;
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--fg);
    margin: 0;
}
.plan-sub {
    font-size: 13px;
    color: var(--fg-3);
    margin: 0;
}
.plan-topbar-actions {
    display: flex;
    gap: 8px;
    align-items: center;
}
@media (max-width: 720px) {
    .plan-topbar { padding: 16px 18px 12px; }
    .plan-title { font-size: 20px; }
    .plan-topbar-actions { flex-wrap: wrap; }
}

.plan-scroll {
    flex: 1;
    padding: 22px 32px 36px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}
@media (max-width: 720px) {
    .plan-scroll { padding: 16px 18px 28px; }
}

/* Hero — big live verdict left, two reference stats right, distribution
   bar across the bottom. */
.orbit-design .od-card.plan-hero {
    padding: 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
}
.plan-hero-top {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 28px;
    flex-wrap: wrap;
}
.plan-hero-primary {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}
.plan-hero-amt {
    font-size: 34px;
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1.1;
    color: var(--fg);
}
.plan-hero-note { font-size: 11.5px; color: var(--fg-3); }
/* Reserve two lines on narrow widths so the note swapping from the
   one-line "checking your balance…" placeholder to the settled copy
   doesn't push the bar and grid down. */
@media (max-width: 520px) {
    .plan-hero-note { min-height: 3.1em; }
}
.plan-hero-side {
    display: flex;
    gap: 32px;
    align-items: center;
    padding-left: 28px;
    border-left: 1px solid var(--line-soft);
}
.plan-summary-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.plan-summary-amt {
    font-size: 20px;
    font-weight: 500;
    letter-spacing: -0.03em;
    margin-top: 2px;
}
.plan-summary-sub {
    font-size: 11px;
    color: var(--fg-3); /* fg-4 fails AA at this size */
}
@media (max-width: 860px) {
    .plan-hero-side { padding-left: 0; border-left: none; flex-basis: 100%; gap: 24px; }
}

/* Distribution bar — every envelope's plan as a colored segment; the
   tick marks the cash actually available. Segments crossing the tick =
   over-budgeting, readable as a shape. Not overflow-clipped so the tick
   survives sitting at 100%. */
.plan-dist { display: flex; flex-direction: column; gap: 8px; }
.plan-dist-bar {
    position: relative;
    height: 14px;
    border-radius: 7px;
    background: var(--bg-elev-2);
}
.plan-dist-seg {
    position: absolute;
    top: 0;
    bottom: 0;
    border-right: 1px solid var(--bg-elev-1);
}
.plan-dist-seg:first-child { border-top-left-radius: 7px; border-bottom-left-radius: 7px; }
/* Right-end rounding is applied inline on the last segment — :last-child
   can't match it (the overlay/tick spans are later siblings). */
.plan-dist-over {
    position: absolute;
    top: -3px;
    bottom: -3px;
    /* Diagonal hatching — a flat tint disappears on top of the bright
       segment colors; stripes read as "this part exceeds your cash". */
    background: repeating-linear-gradient(
        135deg,
        color-mix(in oklab, var(--expense) 65%, transparent) 0 3px,
        transparent 3px 6px
    );
    border: 1px solid color-mix(in oklab, var(--expense) 80%, transparent);
    border-radius: 4px;
    pointer-events: none;
}
.plan-dist-tick {
    position: absolute;
    top: -4px;
    bottom: -4px;
    width: 2.5px;
    transform: translateX(-50%);
    background: var(--fg);
    border-radius: 2px;
}
.plan-dist-caption {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 11px;
    color: var(--fg-3); /* fg-4 fails AA at this size */
}
.plan-dist-caption-tick { display: inline-flex; align-items: center; gap: 6px; color: var(--fg-3); }
.plan-dist-caption-tick i {
    width: 2.5px;
    height: 12px;
    background: var(--fg);
    border-radius: 2px;
}

/* Planning cards — one self-contained decision per envelope. */
.plan-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 14px;
}
.orbit-design .od-card.plan-card {
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.plan-card-head {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
}
.plan-row-dot {
    width: 9px;
    height: 9px;
    border-radius: 3px;
    flex-shrink: 0;
}
.plan-card-name {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.plan-card-spent {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--fg-3);
    white-space: nowrap;
}
.plan-card-ref {
    font-size: 11.5px;
    color: var(--fg-3);
}
.plan-card-ref-avg { color: var(--fg-3); } /* fg-4 fails AA at this size */
.plan-row-coach {
    padding: 6px 10px;
    border-radius: 8px;
    background: color-mix(in oklab, var(--gold) 10%, transparent);
    border: 1px solid color-mix(in oklab, var(--gold) 30%, transparent);
    color: var(--fg-2);
    font-size: 11px;
    line-height: 1.4;
}
.plan-row-input-wrap {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    position: relative;
}
.plan-row-input {
    flex: 1;
    height: 40px;
    padding: 0 12px;
    border-radius: 9px;
    border: 1px solid var(--line);
    background: var(--bg-elev-2);
    color: var(--fg);
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-family: inherit;
    transition: border-color 140ms ease, background 140ms ease;
    width: 100%;
    min-width: 0;
}
.plan-row-input:focus {
    outline: none;
    border-color: var(--brand);
    background: var(--bg);
}
.plan-row-delta {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
/* Editor cell — input on top, quick-set chips, plan-vs-reality bar. */
.plan-row-editor { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.plan-row-quick { display: flex; flex-wrap: wrap; gap: 6px; }
.plan-chip {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 10.5px; color: var(--fg-3); font-family: inherit;
    padding: 3px 9px; border-radius: 999px;
    background: var(--bg-elev-2); border: 1px solid var(--line-soft);
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.plan-chip b { color: var(--fg-2); font-weight: 600; font-variant-numeric: tabular-nums; }
.plan-chip:hover { background: var(--bg-elev-3); color: var(--fg-2); }
.plan-chip:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
.plan-chip-active { border-color: var(--brand); background: var(--brand-soft); color: var(--fg); }
.plan-chip-active b { color: var(--fg); }
/* No overflow:hidden — the tick often sits at exactly 100% (last month's
   actual IS the scale max whenever the plan is below it), and clipping
   would hide it in precisely the case it matters most. */
.plan-row-bar { position: relative; height: 6px; border-radius: 3px; }
.plan-row-bar-fill { position: absolute; inset: 0 auto 0 0; border-radius: 3px; max-width: 100%; }
.plan-row-bar-tick {
    position: absolute; top: -2px; bottom: -2px; width: 2px;
    transform: translateX(-50%);
    background: var(--fg); opacity: 0.8; border-radius: 1px;
}
@media (max-width: 720px) {
    .plan-hero-amt { font-size: 28px; }
    .plan-hero-side { gap: 20px; flex-wrap: wrap; }
    /* Comfortable tap targets on touch widths. */
    .plan-chip { padding: 9px 12px; }
}

.orbit-design .od-card.plan-empty,
.orbit-design .od-card.plan-loading {
    padding: 36px;
    text-align: center;
    color: var(--fg-3);
    font-size: 13px;
}

.plan-readonly-badge {
    display: inline-flex;
    align-items: center;
    height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line);
    color: var(--fg-3);
    font-size: 11.5px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.plan-reconcile-strip {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    background: color-mix(in oklab, var(--expense) 10%, var(--bg-elev-1));
    border: 1px solid color-mix(in oklab, var(--expense) 28%, var(--line));
    color: var(--fg-2);
    font-size: 12.5px;
    line-height: 1.45;
}
.plan-reconcile-strip strong {
    color: var(--fg);
    font-weight: 600;
}
.plan-reconcile-strip > :first-child {
    flex-shrink: 0;
    color: var(--expense);
}
.plan-reconcile-strip > span {
    flex: 1;
    min-width: 0;
}
.plan-reconcile-cancel {
    flex-shrink: 0;
    background: transparent;
    border: 1px solid var(--line);
    color: var(--fg-2);
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12px;
    cursor: pointer;
}
.plan-reconcile-cancel:hover {
    color: var(--fg);
    border-color: var(--line-strong, var(--line));
}
.plan-reconcile-cancel:focus-visible {
    outline: 2px solid var(--brand, var(--fg));
    outline-offset: 2px;
}
@media (max-width: 720px) {
    .plan-reconcile-strip {
        flex-wrap: wrap;
        align-items: flex-start;
    }
    .plan-reconcile-strip > :first-child {
        align-self: flex-start;
        line-height: 1.45;
    }
    .plan-reconcile-strip > span {
        flex: 1 1 calc(100% - 28px);
        min-width: 0;
    }
    .plan-reconcile-cancel {
        margin-left: auto;
        order: 3;
        min-height: 36px;
    }
    .plan-readonly-badge {
        display: none;
    }
}

.plan-row-readonly {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
    padding: 2px 0;
}
.plan-row-readonly-amt {
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.03em;
    color: var(--fg);
}
.plan-row-readonly-net {
    font-size: 11px;
    white-space: nowrap;
}
`;
