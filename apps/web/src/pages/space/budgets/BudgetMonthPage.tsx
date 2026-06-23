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
    const monthOrdinal =
        getAppTzYear(monthDate) * 12 + getAppTzMonth(monthDate);
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
                (e) =>
                    e.cadence === "monthly" &&
                    (isPast || !e.archived)
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
        return envelopes.reduce(
            (s, e) => s + (Number(drafts[e.envelopId]) || 0),
            0
        );
    }, [envelopes, drafts]);

    const totalCurrentlyAllocated = useMemo(
        () => envelopes.reduce((s, e) => s + e.allocated, 0),
        [envelopes]
    );

    const netChange = totalPlanned - totalCurrentlyAllocated;
    const unallocatedNow = summaryQuery.data?.unallocated ?? 0;
    const unallocatedAfterSave = unallocatedNow - netChange;
    const overplanning = unallocatedAfterSave < 0;

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
                errors.push(
                    `${e.name}: ${(err as Error).message ?? "unknown error"}`
                );
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
                    <Link
                        to={ROUTES.spaceBudgets(space.id)}
                        className="plan-back"
                    >
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
                              ? "Reconciliation mode. Saving overwrites this month's budget. Months are independent — later months are unaffected."
                              : "Set what you intend to spend on each envelope. The whole month in one screen."}
                    </p>
                </div>
                <div className="plan-topbar-actions">
                    <Link
                        to={ROUTES.spaceBudgetMonth(
                            space.id,
                            monthSlug(addMonths(monthDate, -1))
                        )}
                        className="od-btn"
                        title={`Go to ${formatInAppTz(
                            addMonths(monthDate, -1),
                            "MMMM yyyy"
                        )}`}
                    >
                        <ChevronLeft className="size-3.5" />{" "}
                        {formatInAppTz(addMonths(monthDate, -1), "MMM")}
                    </Link>
                    {!isCurrentMonth && (
                        <Link
                            to={ROUTES.spaceBudgetMonth(
                                space.id,
                                monthSlug(new Date())
                            )}
                            className="od-btn"
                            title="Jump to the current month"
                        >
                            Today
                        </Link>
                    )}
                    <Link
                        to={ROUTES.spaceBudgetMonth(
                            space.id,
                            monthSlug(addMonths(monthDate, 1))
                        )}
                        className="od-btn"
                        title={`Go to ${formatInAppTz(
                            addMonths(monthDate, 1),
                            "MMMM yyyy"
                        )}`}
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
                            <strong>Reconciliation mode.</strong> Saving
                            overwrites this month's budget. Each month is
                            independent — no other month is affected.
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
                {/* Summary */}
                <div className="od-card plan-summary">
                    <SummaryStat
                        label={isLocked ? "Was budgeted" : "Total budgeted"}
                        value={
                            isLocked
                                ? envelopes.reduce(
                                      (s, e) => s + e.allocated,
                                      0
                                  )
                                : totalPlanned
                        }
                        sub={`across ${envelopes.length} envelope${envelopes.length === 1 ? "" : "s"}`}
                    />
                    {isCurrentMonth && (
                        <>
                            <SummaryStat
                                label="Currently funded"
                                value={Math.max(0, summaryQuery.data?.spendableBalance ?? 0)}
                                sub="liquid cash in your accounts"
                            />
                            <SummaryStat
                                label={overplanning ? "Over-budgeted by" : "Free after save"}
                                value={Math.abs(unallocatedAfterSave)}
                                tone={overplanning ? "expense" : "income"}
                                sub={
                                    overplanning
                                        ? "you'll need that much more income"
                                        : "still unbudgeted"
                                }
                            />
                        </>
                    )}
                    {isPast &&
                        (() => {
                            const totalSpent = envelopes.reduce(
                                (s, e) => s + e.consumed,
                                0
                            );
                            const totalRem = envelopes.reduce(
                                (s, e) => s + e.remaining,
                                0
                            );
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
                                            tone={
                                                totalRem < 0
                                                    ? "expense"
                                                    : "income"
                                            }
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
                                            tone={
                                                netChange > 0
                                                    ? "expense"
                                                    : "income"
                                            }
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
                            <SummaryStat
                                label="Last month spent"
                                value={Array.from(prevById.values())
                                    .filter((e) => e.cadence === "monthly")
                                    .reduce((s, e) => s + e.consumed, 0)}
                                sub="for reference"
                            />
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

                {/* Envelope list */}
                {isLoading ? (
                    <div className="od-card plan-loading">Loading…</div>
                ) : envelopes.length === 0 ? (
                    <div className="od-card plan-empty">
                        No monthly envelopes yet. Create one on the
                        envelopes page first.
                    </div>
                ) : (
                    <div className="od-card plan-list">
                        <div className="plan-list-head">
                            <span>Envelope</span>
                            <span>
                                {isPast && unlocked
                                    ? `${monthLabel.split(" ")[0]} actual`
                                    : `${prevMonthLabel} actual`}
                            </span>
                            <span>{monthLabel.split(" ")[0]} budget</span>
                        </div>
                        {envelopes.map((e) => {
                            const prev = prevById.get(e.envelopId);
                            const recent = recentByEnvelopeId.get(e.envelopId);
                            return (
                                <PlanRow
                                    key={e.envelopId}
                                    env={e}
                                    prevAllocated={prev?.allocated ?? 0}
                                    prevConsumed={prev?.consumed ?? 0}
                                    avg3MonthSpend={
                                        recent?.avg3MonthSpend ?? 0
                                    }
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
}: {
    label: string;
    value: number;
    sub?: string;
    tone?: "expense" | "income";
}) {
    const color =
        tone === "expense"
            ? "var(--expense)"
            : tone === "income"
              ? "var(--income)"
              : "var(--fg)";
    return (
        <div className="plan-summary-stat">
            <span className="eyebrow">{label}</span>
            <span
                className="tabular plan-summary-amt"
                style={{ color }}
            >
                {value.toLocaleString("en-US", {
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
    const showHint =
        !readOnly &&
        avg3MonthSpend > 0 &&
        target > 0 &&
        target < avg3MonthSpend * 0.9;
    return (
        <div className="plan-row">
            <div className="plan-row-name">
                <span
                    className="plan-row-dot"
                    style={{ background: env.color }}
                />
                <div>
                    <div className="plan-row-title">{env.name}</div>
                    <div className="plan-row-meta">
                        {`Spent this period: ${env.consumed.toLocaleString(
                            "en-US",
                            {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            }
                        )}`}
                    </div>
                    {showHint && (
                        <div className="plan-row-coach">
                            You've averaged{" "}
                            {avg3MonthSpend.toFixed(0)}/mo over the last 3
                            months — {target.toFixed(0)} will likely fall short.
                        </div>
                    )}
                </div>
            </div>
            <div className="plan-row-prev">
                <span
                    className="plan-row-prev-mobile-label"
                    aria-hidden
                >
                    {midLabel} actual
                </span>
                <span className="plan-row-prev-amt">
                    {midConsumed.toLocaleString("en-US", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                    })}
                </span>
                <span className="plan-row-prev-sub">
                    of{" "}
                    {midAllocated.toLocaleString("en-US", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                    })}{" "}
                    {midSubSuffix}
                    {avg3MonthSpend > 0 && !reconcileMode && (
                        <>
                            {" · "}
                            <span style={{ color: "var(--fg-3)" }}>
                                avg{" "}
                                {avg3MonthSpend.toFixed(0)}/mo
                            </span>
                        </>
                    )}
                </span>
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
                                    color:
                                        settled < 0
                                            ? "var(--expense)"
                                            : "var(--fg-3)",
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
                <div className="plan-row-input-wrap">
                    <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="plan-row-input"
                    />
                    {delta !== 0 && (
                        <span
                            className="plan-row-delta"
                            style={{
                                color:
                                    delta > 0
                                        ? "var(--income)"
                                        : "var(--expense)",
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

.orbit-design .od-card.plan-summary {
    padding: 22px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
}
@media (max-width: 720px) {
    .orbit-design .od-card.plan-summary {
        grid-template-columns: 1fr;
        gap: 14px;
    }
}
.plan-summary-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.plan-summary-amt {
    font-size: 26px;
    font-weight: 500;
    letter-spacing: -0.04em;
    margin-top: 2px;
}
.plan-summary-sub {
    font-size: 11.5px;
    color: var(--fg-4);
}

.orbit-design .od-card.plan-list {
    padding: 0;
    overflow: hidden;
}
.plan-list-head {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(180px, 1.2fr);
    gap: 16px;
    padding: 12px 18px;
    background: var(--bg-elev-2);
    border-bottom: 1px solid var(--line-soft);
    font-size: 11px;
    color: var(--fg-4);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.plan-row {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(180px, 1.2fr);
    gap: 16px;
    align-items: center;
    padding: 14px 18px;
    border-bottom: 1px solid var(--line-soft);
}
.plan-row:last-child { border-bottom: none; }
.plan-row-name {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}
.plan-row-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    flex-shrink: 0;
}
.plan-row-title {
    font-size: 13.5px;
    color: var(--fg);
    font-weight: 500;
    line-height: 1.2;
}
.plan-row-meta {
    font-size: 11px;
    color: var(--fg-4);
    margin-top: 2px;
}
.plan-row-coach {
    margin-top: 4px;
    padding: 6px 10px;
    border-radius: 8px;
    background: color-mix(in oklab, var(--gold) 10%, transparent);
    border: 1px solid color-mix(in oklab, var(--gold) 30%, transparent);
    color: var(--fg-2);
    font-size: 11px;
    line-height: 1.4;
}
.plan-row-prev {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    color: var(--fg-3);
}
.plan-row-prev-amt {
    font-size: 13px;
    color: var(--fg);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
}
.plan-row-prev-sub {
    font-size: 11px;
    color: var(--fg-4);
}
.plan-row-prev-mobile-label {
    display: none;
}
.plan-row-input-wrap {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    position: relative;
}
.plan-row-input {
    flex: 1;
    height: 34px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg-elev-1);
    color: var(--fg);
    font-size: 13.5px;
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
@media (max-width: 720px) {
    .plan-list-head { display: none; }
    .plan-row {
        grid-template-columns: 1fr;
        gap: 8px;
        padding: 14px 16px;
    }
    .plan-row-prev {
        flex-direction: row;
        flex-wrap: wrap;
        gap: 6px;
        align-items: baseline;
    }
    .plan-row-prev-mobile-label {
        display: inline-block;
        flex-basis: 100%;
        font-size: 10.5px;
        color: var(--fg-4);
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
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
    gap: 8px;
    justify-content: flex-end;
    padding: 0 4px;
}
.plan-row-readonly-amt {
    font-size: 14px;
    font-weight: 500;
    color: var(--fg);
}
.plan-row-readonly-net {
    font-size: 11px;
    white-space: nowrap;
}
`;
