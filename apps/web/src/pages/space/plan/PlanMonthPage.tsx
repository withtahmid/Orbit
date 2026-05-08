import { useMemo, useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import { startOfMonth, endOfMonth, addMonths } from "@/lib/dates";
import type { RouterOutput } from "@/trpc";

type EnvRow = RouterOutput["analytics"]["envelopeUtilization"][number];

function parseMonthSlug(s: string | undefined): Date {
    if (!s) return startOfMonth(new Date());
    const m = /^(\d{4})-(\d{2})$/.exec(s);
    if (!m) return startOfMonth(new Date());
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    return new Date(year, month, 1);
}

function monthSlug(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function PlanMonthPage() {
    const { space } = useCurrentSpace();
    const { month } = useParams<{ month: string }>();
    const navigate = useNavigate();

    const monthDate = useMemo(() => parseMonthSlug(month), [month]);
    const periodStart = useMemo(() => startOfMonth(monthDate), [monthDate]);
    const periodEnd = useMemo(() => endOfMonth(monthDate), [monthDate]);
    const prevDate = useMemo(() => addMonths(monthDate, -1), [monthDate]);
    const prevPeriodStart = useMemo(() => startOfMonth(prevDate), [prevDate]);
    const prevPeriodEnd = useMemo(() => endOfMonth(prevDate), [prevDate]);

    const monthLabel = monthDate.toLocaleString("en-US", {
        month: "long",
        year: "numeric",
    });
    const prevMonthLabel = prevDate.toLocaleString("en-US", {
        month: "short",
    });

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

    const utils = trpc.useUtils();
    const allocate = trpc.envelop.allocationCreate.useMutation();

    // Envelopes filtered to monthly cadence — the start-of-month ritual is
    // for repeating monthly buckets. Rolling envelopes (cadence='none') are
    // accumulators and don't reset.
    const envelopes: EnvRow[] = useMemo(
        () =>
            (currentQuery.data ?? []).filter((e) => e.cadence === "monthly"),
        [currentQuery.data]
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

    const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
    useEffect(() => {
        // Reset hydration whenever the month changes; the next effect picks
        // up fresh data and hydrates again.
        setHydrated(false);
        setDrafts({});
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

    // spaceSummary is computed server-side against NOW (resolveSpaceUnallocated
    // is hard-coded to the current calendar month). Showing "Currently funded"
    // / "Free after save" for past or future months would be misleading. Gate
    // those stats to the current month only.
    const nowKey = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${d.getMonth()}`;
    })();
    const isCurrentMonth = monthKey === nowKey;

    const [saving, setSaving] = useState(false);

    const onSave = async () => {
        if (saving) return;
        setSaving(true);
        const periodStartUtc = new Date(
            Date.UTC(monthDate.getFullYear(), monthDate.getMonth(), 1)
        );
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
                    accountId: null,
                    periodStart: periodStartUtc,
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
            utils.analytics.accountAllocation.invalidate(),
        ]);
        setSaving(false);
        if (errors.length === 0) {
            toast.success(
                successes.length === 0
                    ? "Nothing to save"
                    : `Saved ${successes.length} envelope${successes.length === 1 ? "" : "s"}`
            );
            navigate(ROUTES.spaceEnvelopes(space.id));
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
                        to={ROUTES.spaceEnvelopes(space.id)}
                        className="plan-back"
                    >
                        <ArrowLeft className="size-3.5" /> Envelopes
                    </Link>
                    <h1 className="display plan-title">Plan {monthLabel}</h1>
                    <p className="plan-sub">
                        Set what you intend to spend on each envelope. The
                        whole month in one screen.
                    </p>
                </div>
                <div className="plan-topbar-actions">
                    <Link
                        to={ROUTES.spacePlanMonth(
                            space.id,
                            monthSlug(addMonths(monthDate, -1))
                        )}
                        className="od-btn"
                    >
                        <ChevronLeft className="size-3.5" />{" "}
                        {addMonths(monthDate, -1).toLocaleString("en-US", {
                            month: "short",
                        })}
                    </Link>
                    <button
                        type="button"
                        className="od-btn od-btn-primary"
                        onClick={onSave}
                        disabled={saving || !hydrated}
                    >
                        <Save className="size-3.5" />
                        {saving ? "Saving…" : "Save plan"}
                    </button>
                </div>
            </header>

            <div className="plan-scroll">
                {/* Summary */}
                <div className="od-card plan-summary">
                    <SummaryStat
                        label="Total planned"
                        value={totalPlanned}
                        sub={`across ${envelopes.length} envelope${envelopes.length === 1 ? "" : "s"}`}
                    />
                    {isCurrentMonth ? (
                        <>
                            <SummaryStat
                                label="Currently funded"
                                value={Math.max(0, summaryQuery.data?.spendableBalance ?? 0)}
                                sub="liquid cash in your accounts"
                            />
                            <SummaryStat
                                label={overplanning ? "Over-planned by" : "Free after save"}
                                value={Math.abs(unallocatedAfterSave)}
                                tone={overplanning ? "expense" : "income"}
                                sub={
                                    overplanning
                                        ? "you'll need that much more income"
                                        : "still unbudgeted"
                                }
                            />
                        </>
                    ) : (
                        <>
                            <SummaryStat
                                label="Last month spent"
                                value={Array.from(prevById.values()).reduce(
                                    (s, e) => s + e.consumed,
                                    0
                                )}
                                sub="for reference"
                            />
                            <SummaryStat
                                label="Net change"
                                value={Math.abs(netChange)}
                                tone={netChange > 0 ? "expense" : "income"}
                                sub={
                                    netChange > 0
                                        ? `more planned than before`
                                        : netChange < 0
                                          ? `less planned than before`
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
                            <span>{prevMonthLabel} actual</span>
                            <span>{monthLabel.split(" ")[0]} plan</span>
                        </div>
                        {envelopes.map((e) => {
                            const prev = prevById.get(e.envelopId);
                            return (
                                <PlanRow
                                    key={e.envelopId}
                                    env={e}
                                    prevAllocated={prev?.allocated ?? 0}
                                    prevConsumed={prev?.consumed ?? 0}
                                    value={drafts[e.envelopId] ?? ""}
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
                $
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
    value,
    onChange,
}: {
    env: EnvRow;
    prevAllocated: number;
    prevConsumed: number;
    value: string;
    onChange: (v: string) => void;
}) {
    const target = Number(value) || 0;
    const delta = target - env.allocated;
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
                        Already spent this period: $
                        {env.consumed.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                    </div>
                </div>
            </div>
            <div className="plan-row-prev">
                <span className="plan-row-prev-amt">
                    $
                    {prevConsumed.toLocaleString("en-US", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                    })}
                </span>
                <span className="plan-row-prev-sub">
                    of $
                    {prevAllocated.toLocaleString("en-US", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                    })}{" "}
                    planned
                </span>
            </div>
            <div className="plan-row-input-wrap">
                <span className="plan-row-input-prefix">$</span>
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
                        {delta > 0 ? "+" : "−"}$
                        {Math.abs(delta).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                    </span>
                )}
            </div>
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
.plan-row-input-wrap {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    position: relative;
}
.plan-row-input-prefix {
    position: absolute;
    left: 10px;
    font-size: 12px;
    color: var(--fg-4);
    pointer-events: none;
}
.plan-row-input {
    flex: 1;
    height: 34px;
    padding: 0 10px 0 22px;
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
        gap: 6px;
        align-items: baseline;
    }
}

.orbit-design .od-card.plan-empty,
.orbit-design .od-card.plan-loading {
    padding: 36px;
    text-align: center;
    color: var(--fg-3);
    font-size: 13px;
}
`;
