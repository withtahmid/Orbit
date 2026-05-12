import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { useIdempotencyKey } from "@/hooks/useIdempotencyKey";
import { ROUTES } from "@/router/routes";
import { startOfMonth, endOfMonth } from "@/lib/dates";
import type { RouterOutput } from "@/trpc";

type PendingItem = RouterOutput["reckoning"]["listPending"][number];
type Candidate = {
    envelopId: string;
    name: string;
    color: string;
    remaining: number;
    archived: boolean;
};

/**
 * End-of-month reckoning. Lists every past-month overspend the user
 * hasn't resolved yet and offers three explicit resolutions per row:
 *   - Pull from another envelope (uses allocation.transfer)
 *   - Borrow from next month (uses envelop.borrowFromNextMonth)
 *   - Absorb (just acknowledge, no money movement)
 *
 * Each click EXECUTES the resolution (where applicable) AND records the
 * acknowledgment so the row clears. The user can also resolve all in
 * one go via "Absorb everything" if they don't want to engage.
 *
 * In the personal sentinel space (`/s/me`), this dispatches to a
 * cross-space variant: it lists pending items from every space the
 * user is a member of, but resolution itself stays per-space (the
 * resolution mutations need a concrete space). Each personal row links
 * to its space's reckoning page.
 */
export default function ReckoningPage() {
    const { space } = useCurrentSpace();
    if (space.isPersonal) return <PersonalReckoning />;
    return <PerSpaceReckoning />;
}

function PerSpaceReckoning() {
    const { space } = useCurrentSpace();
    const navigate = useNavigate();
    const utils = trpc.useUtils();

    const pendingQuery = trpc.reckoning.listPending.useQuery({
        spaceId: space.id,
    });

    // Hoisted: one envelope-utilization query for the WHOLE page, scoped
    // to the current calendar month. Each row picks its candidate sources
    // from this shared dataset. Was N queries (one per row) on a 1-day
    // window, which both wasted requests and computed remaining over the
    // wrong period.
    const periodStart = useMemo(() => startOfMonth(new Date()), []);
    const periodEnd = useMemo(() => endOfMonth(new Date()), []);
    const utilizationQuery = trpc.analytics.envelopeUtilization.useQuery({
        spaceId: space.id,
        periodStart,
        periodEnd,
    });
    const allCandidates: Candidate[] = useMemo(
        () =>
            (utilizationQuery.data ?? [])
                .filter((e) => e.remaining > 0 && !e.archived)
                .map((e) => ({
                    envelopId: e.envelopId,
                    name: e.name,
                    color: e.color,
                    remaining: e.remaining,
                    archived: e.archived,
                })),
        [utilizationQuery.data]
    );

    const acknowledge = trpc.reckoning.acknowledge.useMutation();
    const borrow = trpc.envelop.borrowFromNextMonth.useMutation();

    const [busyId, setBusyId] = useState<string | null>(null);

    const refresh = async () => {
        await Promise.all([
            utils.reckoning.listPending.invalidate({ spaceId: space.id }),
            utils.analytics.envelopeUtilization.invalidate({
                spaceId: space.id,
            }),
            utils.analytics.spaceSummary.invalidate(),
            utils.analytics.unbudgetedTrend.invalidate({ spaceId: space.id }),
        ]);
    };

    const items = pendingQuery.data ?? [];

    const handleAbsorb = async (item: PendingItem) => {
        const id = `${item.envelopId}-${item.periodStart}`;
        if (busyId) return;
        setBusyId(id);
        try {
            await acknowledge.mutateAsync({
                envelopId: item.envelopId,
                periodStart: new Date(item.periodStart),
                resolution: "absorbed",
                idempotencyKey: crypto.randomUUID(),
            });
            await refresh();
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setBusyId(null);
        }
    };

    const handleBorrow = async (item: PendingItem) => {
        const id = `${item.envelopId}-${item.periodStart}`;
        if (busyId) return;
        setBusyId(id);
        try {
            await borrow.mutateAsync({
                envelopId: item.envelopId,
                amount: item.overBy,
                idempotencyKey: crypto.randomUUID(),
            });
            await acknowledge.mutateAsync({
                envelopId: item.envelopId,
                periodStart: new Date(item.periodStart),
                resolution: "borrowed",
                idempotencyKey: crypto.randomUUID(),
            });
            await refresh();
            toast.success(`Borrowed ${item.overBy.toFixed(2)} from next month`);
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setBusyId(null);
        }
    };

    const handleAbsorbAll = async () => {
        if (busyId || items.length === 0) return;
        setBusyId("ALL");
        try {
            for (const item of items) {
                await acknowledge.mutateAsync({
                    envelopId: item.envelopId,
                    periodStart: new Date(item.periodStart),
                    resolution: "absorbed",
                    idempotencyKey: crypto.randomUUID(),
                });
            }
            await refresh();
            toast.success("All overspends acknowledged");
            navigate(ROUTES.spaceEnvelopes(space.id));
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setBusyId(null);
        }
    };

    const totalOverspend = items.reduce((s, i) => s + i.overBy, 0);

    return (
        <div className="orbit-design rk-root">
            <style>{RK_STYLES}</style>

            <header className="rk-topbar">
                <div className="rk-topbar-text">
                    <Link
                        to={ROUTES.spaceEnvelopes(space.id)}
                        className="rk-back"
                    >
                        <ArrowLeft className="size-3.5" /> Envelopes
                    </Link>
                    <h1 className="display rk-title">Settle past months</h1>
                    <p className="rk-sub">
                        {items.length === 0
                            ? "Nothing pending — every past-month overspend has been resolved."
                            : `${items.length} envelope${items.length === 1 ? "" : "s"} overspent across past months — total ${totalOverspend.toFixed(2)}. Pick how to handle each.`}
                    </p>
                </div>
                {items.length > 0 && (
                    <button
                        type="button"
                        className="od-btn"
                        onClick={handleAbsorbAll}
                        disabled={busyId !== null}
                    >
                        {busyId === "ALL"
                            ? "Acknowledging…"
                            : "Absorb everything"}
                    </button>
                )}
            </header>

            <div className="rk-scroll">
                {pendingQuery.isLoading ? (
                    <div className="od-card rk-empty">Loading…</div>
                ) : items.length === 0 ? (
                    <div className="od-card rk-empty">
                        <Check
                            className="size-5"
                            style={{ color: "var(--income)" }}
                        />
                        <div className="rk-empty-title">All caught up</div>
                        <div className="rk-empty-sub">
                            No past-month overspends need your attention.
                        </div>
                    </div>
                ) : (
                    <div className="rk-list">
                        {items.map((item) => (
                            <ReckoningRow
                                key={`${item.envelopId}-${item.periodStart}`}
                                item={item}
                                busyId={busyId}
                                allCandidates={allCandidates}
                                onAbsorb={() => handleAbsorb(item)}
                                onBorrow={() => handleBorrow(item)}
                                onPullSuccess={refresh}
                                spaceId={space.id}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function ReckoningRow({
    item,
    busyId,
    allCandidates,
    onAbsorb,
    onBorrow,
    onPullSuccess,
    spaceId,
}: {
    item: PendingItem;
    busyId: string | null;
    allCandidates: Candidate[];
    onAbsorb: () => void;
    onBorrow: () => void;
    onPullSuccess: () => Promise<void>;
    spaceId: string;
}) {
    const candidates = useMemo(
        () => allCandidates.filter((e) => e.envelopId !== item.envelopId),
        [allCandidates, item.envelopId]
    );

    const id = `${item.envelopId}-${item.periodStart}`;
    const busy = busyId === id;
    const otherBusy = busyId !== null && busyId !== id;

    const utils = trpc.useUtils();
    const acknowledge = trpc.reckoning.acknowledge.useMutation();
    const transfer = trpc.allocation.transfer.useMutation();
    const pullIdem = useIdempotencyKey();
    const ackIdem = useIdempotencyKey();

    const [pullSourceId, setPullSourceId] = useState("");
    const [pulling, setPulling] = useState(false);

    const handlePull = async () => {
        if (!pullSourceId) return;
        setPulling(true);
        try {
            await transfer.mutateAsync({
                amount: item.overBy,
                from: { kind: "envelop", envelopId: pullSourceId },
                to: { kind: "envelop", envelopId: item.envelopId },
                idempotencyKey: pullIdem.key,
            });
            await acknowledge.mutateAsync({
                envelopId: item.envelopId,
                periodStart: new Date(item.periodStart),
                resolution: "pulled",
                idempotencyKey: ackIdem.key,
            });
            pullIdem.rotate();
            ackIdem.rotate();
            await utils.reckoning.listPending.invalidate({ spaceId });
            await onPullSuccess();
            toast.success(`Pulled ${item.overBy.toFixed(2)}`);
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setPulling(false);
        }
    };

    const fmtMonth = (s: string) =>
        new Date(s).toLocaleString("en-US", {
            month: "long",
            year: "numeric",
        });

    return (
        <div className="rk-row">
            <div className="rk-row-head">
                <span
                    className="rk-row-dot"
                    style={{ background: item.color }}
                />
                <div className="rk-row-text">
                    <div className="rk-row-title">
                        {item.name}
                        <span className="rk-row-month">
                            {fmtMonth(item.periodStart)}
                        </span>
                    </div>
                    <div className="rk-row-sub">
                        Spent {item.consumed.toFixed(2)} of{" "}
                        {item.allocated.toFixed(2)} planned ·
                        <strong style={{ color: "var(--expense)" }}>
                            {" "}
                            {item.overBy.toFixed(2)} over
                        </strong>
                    </div>
                </div>
            </div>

            <div className="rk-row-options">
                {candidates.length > 0 && (
                    <div className="rk-option-card">
                        <div className="rk-option-title">
                            Pull from another envelope
                        </div>
                        <div className="rk-option-hint">
                            Move {item.overBy.toFixed(2)} of allocation from
                            an envelope with surplus.
                        </div>
                        <div className="rk-option-row">
                            <select
                                className="rk-select"
                                value={pullSourceId}
                                onChange={(e) =>
                                    setPullSourceId(e.target.value)
                                }
                                disabled={busy || otherBusy || pulling}
                            >
                                <option value="">Choose source…</option>
                                {candidates.map((c) => (
                                    <option
                                        key={c.envelopId}
                                        value={c.envelopId}
                                    >
                                        {c.name} · {c.remaining.toFixed(2)}{" "}
                                        left
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="od-btn"
                                disabled={
                                    !pullSourceId ||
                                    busy ||
                                    otherBusy ||
                                    pulling
                                }
                                onClick={handlePull}
                            >
                                {pulling
                                    ? "Pulling…"
                                    : `Pull ${item.overBy.toFixed(2)}`}
                            </button>
                        </div>
                    </div>
                )}

                <div className="rk-option-card">
                    <div className="rk-option-title">
                        Borrow from next month
                    </div>
                    <div className="rk-option-hint">
                        Adds {item.overBy.toFixed(2)} to{" "}
                        {item.name} retroactively, removes the same from
                        next month's plan.
                    </div>
                    <div className="rk-option-row rk-option-row--end">
                        <button
                            type="button"
                            className="od-btn"
                            disabled={busy || otherBusy}
                            onClick={onBorrow}
                        >
                            {busy
                                ? "Borrowing…"
                                : `Borrow ${item.overBy.toFixed(2)}`}
                        </button>
                    </div>
                </div>

                <div className="rk-option-card rk-option-card--quiet">
                    <div className="rk-option-title">
                        Just acknowledge it
                    </div>
                    <div className="rk-option-hint">
                        Accept that {item.overBy.toFixed(2)} came out of
                        your unbudgeted buffer this period. Move on.
                    </div>
                    <div className="rk-option-row rk-option-row--end">
                        <button
                            type="button"
                            className="od-btn"
                            disabled={busy || otherBusy}
                            onClick={onAbsorb}
                        >
                            {busy ? "Acknowledging…" : "Absorb"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const RK_STYLES = `
.rk-root {
    margin: -1.5rem -1rem;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
}
@media (min-width: 768px) {
    .rk-root { margin: -2rem; }
}
.rk-topbar {
    padding: 22px 32px 18px;
    border-bottom: 1px solid var(--line-soft);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    background: var(--bg);
    flex-wrap: wrap;
}
.rk-topbar-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 240px;
}
.rk-back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--fg-3);
    text-decoration: none;
    padding-bottom: 4px;
}
.rk-back:hover { color: var(--fg); }
.rk-title {
    font-size: 24px;
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--fg);
    margin: 0;
}
.rk-sub { font-size: 13px; color: var(--fg-3); margin: 0; max-width: 640px; }

.rk-scroll {
    flex: 1;
    padding: 22px 32px 36px;
}

.rk-list {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.rk-row {
    background: var(--bg-elev-1);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}
.rk-row-head {
    display: flex;
    align-items: flex-start;
    gap: 12px;
}
.rk-row-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    flex-shrink: 0;
    margin-top: 6px;
}
.rk-row-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.rk-row-title {
    font-size: 16px;
    font-weight: 500;
    color: var(--fg);
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
}
.rk-row-month {
    font-size: 11px;
    color: var(--fg-3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
}
.rk-row-sub {
    font-size: 12.5px;
    color: var(--fg-3);
    font-variant-numeric: tabular-nums;
}

.rk-row-options {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
}
@media (max-width: 900px) {
    .rk-row-options { grid-template-columns: 1fr; }
}

.rk-option-card {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px 14px;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.rk-option-card--quiet {
    background: var(--bg-elev-1);
}
.rk-option-title {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--fg);
}
.rk-option-hint {
    font-size: 11px;
    color: var(--fg-4);
    line-height: 1.45;
}
.rk-option-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: auto;
}
.rk-option-row--end { justify-content: flex-end; }
.rk-select {
    flex: 1;
    height: 30px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--fg);
    font-size: 12px;
    padding: 0 8px;
    font-family: inherit;
}

.orbit-design .od-card.rk-empty {
    padding: 40px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}
.rk-empty-title { font-size: 14px; font-weight: 500; color: var(--fg); }
.rk-empty-sub { font-size: 12px; color: var(--fg-3); }

/* Personal-mode list rendering — grouped by space, with per-row link. */
.rk-personal-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.rk-personal-group-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 0 4px;
}
.rk-personal-group-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--fg-3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
}
.rk-personal-group-cta {
    font-size: 12px;
    font-weight: 500;
    color: var(--brand);
    text-decoration: none;
}
.rk-personal-group-cta:hover { text-decoration: underline; }
.rk-personal-group-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--bg-elev-1);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 8px;
}
.rk-personal-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 8px;
}
.rk-personal-row:hover { background: var(--bg-elev-2); }
.rk-personal-row-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    flex-shrink: 0;
}
.rk-personal-row-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.rk-personal-row-name {
    font-size: 13px;
    color: var(--fg);
    font-weight: 500;
}
.rk-personal-row-meta {
    font-size: 11.5px;
    color: var(--fg-3);
    font-variant-numeric: tabular-nums;
}

/* Phone (<640px) */
@media (max-width: 640px) {
    .rk-topbar { padding: 14px 14px 10px; gap: 10px; }
    .rk-topbar-text { min-width: 0; }
    .rk-title { font-size: 20px; }
    .rk-scroll { padding: 12px 14px 22px; }
    .rk-row { padding: 14px; gap: 12px; }
    .rk-row-title { font-size: 14px; gap: 8px; }
    .rk-option-card { padding: 10px 12px; }
    .orbit-design .od-card.rk-empty { padding: 24px; }
    .rk-personal-group-list { padding: 6px; }
    .rk-personal-row { padding: 10px; gap: 10px; }
}
`;

/**
 * Personal (cross-space) reckoning. Lists every pending overspend across
 * every space the user is a member of, grouped by space. The resolution
 * mutations live at the per-space reckoning page so each row links there
 * — the personal namespace's job is unified visibility, not unified
 * action surface.
 */
function PersonalReckoning() {
    const pendingQuery = trpc.personal.reckoning.listPending.useQuery({});
    const items = pendingQuery.data ?? [];

    // Group by space: each space gets a sub-card with its rows + a
    // "Settle in [Space] →" link.
    const groups = useMemo(() => {
        const m = new Map<
            string,
            {
                spaceId: string;
                spaceName: string;
                rows: typeof items;
            }
        >();
        for (const item of items) {
            const existing = m.get(item.spaceId);
            if (existing) {
                existing.rows.push(item);
            } else {
                m.set(item.spaceId, {
                    spaceId: item.spaceId,
                    spaceName: item.spaceName,
                    rows: [item],
                });
            }
        }
        return Array.from(m.values()).sort((a, b) =>
            a.spaceName.localeCompare(b.spaceName)
        );
    }, [items]);

    const totalOverspend = items.reduce((s, i) => s + i.overBy, 0);
    const fmtMonth = (s: string) =>
        new Date(s).toLocaleString("en-US", {
            month: "long",
            year: "numeric",
        });

    return (
        <div className="orbit-design rk-root">
            <style>{RK_STYLES}</style>

            <header className="rk-topbar">
                <div className="rk-topbar-text">
                    <h1 className="display rk-title">Settle past months</h1>
                    <p className="rk-sub">
                        {items.length === 0
                            ? "Nothing pending across any of your spaces — every past-month overspend has been resolved."
                            : `${items.length} envelope${items.length === 1 ? "" : "s"} overspent across ${groups.length} space${groups.length === 1 ? "" : "s"} — total ${totalOverspend.toFixed(2)}. Open each space to resolve.`}
                    </p>
                </div>
            </header>

            <div className="rk-scroll">
                {pendingQuery.isLoading ? (
                    <div className="od-card rk-empty">Loading…</div>
                ) : items.length === 0 ? (
                    <div className="od-card rk-empty">
                        <Check
                            className="size-5"
                            style={{ color: "var(--income)" }}
                        />
                        <div className="rk-empty-title">All caught up</div>
                        <div className="rk-empty-sub">
                            No past-month overspends need your attention.
                        </div>
                    </div>
                ) : (
                    <div className="rk-list">
                        {groups.map((g) => (
                            <div
                                key={g.spaceId}
                                className="rk-personal-group"
                            >
                                <div className="rk-personal-group-head">
                                    <span className="rk-personal-group-name">
                                        {g.spaceName} ·{" "}
                                        {g.rows.length} item
                                        {g.rows.length === 1 ? "" : "s"}
                                    </span>
                                    <Link
                                        to={ROUTES.spaceReckoning(g.spaceId)}
                                        className="rk-personal-group-cta"
                                    >
                                        Settle in {g.spaceName} →
                                    </Link>
                                </div>
                                <div className="rk-personal-group-list">
                                    {g.rows.map((row) => (
                                        <div
                                            key={`${row.envelopId}-${row.periodStart}`}
                                            className="rk-personal-row"
                                        >
                                            <span
                                                className="rk-personal-row-dot"
                                                style={{ background: row.color }}
                                            />
                                            <div className="rk-personal-row-text">
                                                <div className="rk-personal-row-name">
                                                    {row.name}
                                                </div>
                                                <div className="rk-personal-row-meta">
                                                    {fmtMonth(row.periodStart)}{" "}
                                                    · spent{" "}
                                                    {row.consumed.toFixed(2)}{" "}
                                                    of {row.allocated.toFixed(2)}{" "}
                                                    ·{" "}
                                                    <strong
                                                        style={{
                                                            color:
                                                                "var(--expense)",
                                                        }}
                                                    >
                                                        {row.overBy.toFixed(2)}{" "}
                                                        over
                                                    </strong>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
