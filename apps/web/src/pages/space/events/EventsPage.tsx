import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    CalendarDays,
    Plus,
    Eye,
    ChevronDown,
    Check,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { formatInAppTz } from "@/lib/formatDate";
import { ROUTES } from "@/router/routes";
import { CreateOrEditEventDialog } from "./CreateOrEditEventDialog";
import { DeleteEventDialog } from "./DeleteEventDialog";
import { EventStatusButton } from "./EventStatusButton";
import {
    DesignIcon,
    EntityAvatar,
    EstimateProgressBar,
    Metric,
    Money,
    Skeleton,
} from "./eventUI";
import {
    eventCalendarState,
    type EventStatus,
    type EventTotal,
} from "./types";

type StatusFilter = "all" | "active" | "closed";

export default function EventsPage() {
    const { space } = useCurrentSpace();
    const [year, setYear] = useState(() => new Date().getFullYear());
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const eventsQuery = trpc.analytics.eventTotals.useQuery({ spaceId: space.id });

    const events = useMemo<EventTotal[]>(() => {
        return (eventsQuery.data ?? []).map((ev) => ({
            ...ev,
            startTime: new Date(ev.startTime),
            endTime: new Date(ev.endTime),
            closedAt: ev.closedAt ? new Date(ev.closedAt) : null,
            status: ev.status as EventStatus,
        }));
    }, [eventsQuery.data]);

    const yearEvents = useMemo(
        () =>
            events.filter(
                (e) =>
                    e.startTime.getFullYear() <= year &&
                    e.endTime.getFullYear() >= year
            ),
        [events, year]
    );

    const counts = useMemo(() => {
        let active = 0;
        let closed = 0;
        for (const e of yearEvents) {
            if (e.status === "closed") closed += 1;
            else active += 1;
        }
        return { all: yearEvents.length, active, closed };
    }, [yearEvents]);

    const visibleEvents = useMemo(
        () =>
            yearEvents.filter((e) =>
                statusFilter === "all" ? true : e.status === statusFilter
            ),
        [yearEvents, statusFilter]
    );

    const sorted = useMemo(
        () => [...visibleEvents].sort((a, b) => a.startTime.getTime() - b.startTime.getTime()),
        [visibleEvents]
    );

    const now = new Date();
    const yearStart = new Date(year, 0, 1).getTime();
    const yearEnd = new Date(year + 1, 0, 1).getTime();
    const yearLen = yearEnd - yearStart;

    const yearOptions = useMemo(() => {
        const set = new Set<number>([year, year - 1, year + 1]);
        for (const e of events) set.add(e.startTime.getFullYear());
        return Array.from(set).sort();
    }, [events, year]);

    return (
        <div className="orbit-design ev-root">
            <style>{EV_STYLES}</style>

            {/* Topbar */}
            <header className="ev-topbar">
                <div className="ev-topbar-text">
                    <span className="eyebrow">Trips · projects · occasions</span>
                    <h1 className="display ev-title">Events</h1>
                    <p className="ev-sub">
                        Tag transactions to events to track totals across multiple
                        categories.
                    </p>
                </div>
                <div className="ev-topbar-actions">
                    <StatusFilterSegmented
                        value={statusFilter}
                        onChange={setStatusFilter}
                        counts={counts}
                    />
                    <YearPicker year={year} setYear={setYear} options={yearOptions} />
                    <PermissionGate roles={["owner", "editor"]}>
                        <CreateOrEditEventDialog
                            trigger={
                                <button
                                    type="button"
                                    className="od-btn od-btn-primary"
                                >
                                    <Plus className="size-3.5" /> New event
                                </button>
                            }
                        />
                    </PermissionGate>
                </div>
            </header>

            <div className="ev-scroll">
                {/* Timeline */}
                <div className="od-card ev-section">
                    <div className="ev-sect-head">
                        <div className="ev-sect-text">
                            <h2 className="display ev-sect-title">Timeline</h2>
                            <span className="ev-sect-sub">Across the year</span>
                        </div>
                    </div>
                    <div className="ev-timeline">
                        <div className="ev-timeline-axis" aria-hidden />
                        <div className="ev-timeline-months">
                            {[
                                "Jan",
                                "Feb",
                                "Mar",
                                "Apr",
                                "May",
                                "Jun",
                                "Jul",
                                "Aug",
                                "Sep",
                                "Oct",
                                "Nov",
                                "Dec",
                            ].map((m, i) => (
                                <span
                                    key={m}
                                    className="ev-timeline-month"
                                    style={{ left: `${(i / 11) * 100}%` }}
                                >
                                    {m}
                                </span>
                            ))}
                        </div>
                        {sorted.map((e) => {
                            const start = Math.max(e.startTime.getTime(), yearStart);
                            const end = Math.min(e.endTime.getTime(), yearEnd);
                            const left = ((start - yearStart) / yearLen) * 100;
                            const width = Math.max(
                                1.4,
                                ((end - start) / yearLen) * 100
                            );
                            const dim = e.status === "closed";
                            return (
                                <div
                                    key={e.eventId}
                                    className="ev-timeline-pill"
                                    style={{
                                        left: `${left}%`,
                                        width: `${width}%`,
                                        background: `color-mix(in oklab, ${e.color} ${dim ? 12 : 22}%, transparent)`,
                                        border: `1px solid ${e.color}`,
                                        color: e.color,
                                        opacity: dim ? 0.65 : 1,
                                    }}
                                    title={e.name}
                                >
                                    <DesignIcon
                                        name={e.icon}
                                        size={9}
                                        color={e.color}
                                    />
                                    <span className="ev-timeline-pill-name">{e.name}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Cards */}
                {eventsQuery.isLoading ? (
                    <div className="ev-grid">
                        {[0, 1, 2, 3].map((i) => (
                            <Skeleton key={i} height={170} />
                        ))}
                    </div>
                ) : sorted.length === 0 ? (
                    <div className="od-card ev-empty">
                        <CalendarDays
                            className="size-6"
                            style={{ color: "var(--fg-4)" }}
                        />
                        <div
                            style={{
                                fontSize: 14,
                                color: "var(--fg-2)",
                                fontWeight: 500,
                            }}
                        >
                            {statusFilter === "closed"
                                ? `No closed events in ${year}`
                                : statusFilter === "active"
                                  ? `No active events in ${year}`
                                  : `No events in ${year}`}
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--fg-4)" }}>
                            Events help group related transactions (weddings, trips,
                            etc.).
                        </div>
                        <PermissionGate roles={["owner", "editor"]}>
                            <CreateOrEditEventDialog
                                trigger={
                                    <button className="od-btn od-btn-primary">
                                        <Plus className="size-3.5" /> New event
                                    </button>
                                }
                            />
                        </PermissionGate>
                    </div>
                ) : (
                    <div className="ev-grid">
                        {sorted.map((e) => (
                            <EventCard key={e.eventId} e={e} now={now} spaceId={space.id} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function EventCard({
    e,
    now,
    spaceId,
}: {
    e: EventTotal;
    now: Date;
    spaceId: string;
}) {
    const calendarState = eventCalendarState(e.startTime, e.endTime, now);
    const closed = e.status === "closed";
    const net = e.incomeTotal - e.expenseTotal;
    const lifecycleTone = closed ? "var(--fg-3)" : "var(--brand)";
    const hasEstimate = e.estimatedAmount !== null && e.estimatedAmount > 0;
    const pct = hasEstimate
        ? (e.expenseTotal / (e.estimatedAmount as number)) * 100
        : 0;
    const overByOrLeft = hasEstimate
        ? e.expenseTotal - (e.estimatedAmount as number)
        : 0;

    return (
        <div
            className="od-card ev-card"
            style={{ opacity: closed ? 0.85 : 1 }}
        >
            <div className="ev-card-head">
                <span className="ev-card-name">
                    <EntityAvatar icon={e.icon} colorVar={e.color} size={36} />
                    <span className="ev-card-text">
                        <span className="ev-card-title">{e.name}</span>
                        <span className="ev-card-range">
                            {formatInAppTz(e.startTime, "MMM d")} →{" "}
                            {formatInAppTz(e.endTime, "MMM d")}
                            <span className="ev-card-calstate">
                                {" · "}
                                {calendarState.toLowerCase()}
                            </span>
                        </span>
                    </span>
                </span>
                <span
                    className="ev-card-state"
                    style={{
                        color: lifecycleTone,
                        borderColor: closed
                            ? "var(--line)"
                            : "color-mix(in oklab, var(--brand) 30%, transparent)",
                    }}
                >
                    {closed ? "Closed" : "Active"}
                </span>
            </div>
            <div className="ev-card-stats">
                <Metric
                    label={closed ? "Final spend" : "Spent"}
                    value={
                        <Money
                            amount={e.expenseTotal}
                            size={16}
                            weight={500}
                            variant={e.expenseTotal ? "expense" : "muted"}
                        />
                    }
                />
                <Metric
                    label={closed ? "Final received" : "Received"}
                    value={
                        <Money
                            amount={e.incomeTotal}
                            size={16}
                            weight={500}
                            variant={e.incomeTotal ? "income" : "muted"}
                        />
                    }
                />
                <Metric
                    label="Transactions"
                    value={
                        <span
                            className="tabular"
                            style={{
                                fontSize: 16,
                                color: "var(--fg)",
                                fontWeight: 500,
                            }}
                        >
                            {e.txCount}
                        </span>
                    }
                />
            </div>
            {hasEstimate ? (
                <div className="ev-card-progress">
                    <EstimateProgressBar
                        spent={e.expenseTotal}
                        estimate={e.estimatedAmount as number}
                    />
                    <div className="ev-card-progress-row">
                        <span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>
                            <Money amount={e.expenseTotal} size={11.5} /> of{" "}
                            <Money amount={e.estimatedAmount as number} size={11.5} />
                            <span style={{ color: "var(--fg-4)" }}>
                                {" · "}
                                {pct.toFixed(0)}%
                            </span>
                        </span>
                        <span
                            style={{
                                fontSize: 11.5,
                                color:
                                    overByOrLeft > 0
                                        ? "var(--expense)"
                                        : "var(--fg-4)",
                            }}
                        >
                            {overByOrLeft > 0 ? (
                                <>
                                    +<Money amount={overByOrLeft} size={11.5} variant="expense" />{" "}
                                    over
                                </>
                            ) : (
                                <>
                                    <Money amount={-overByOrLeft} size={11.5} /> left
                                </>
                            )}
                        </span>
                    </div>
                </div>
            ) : (
                <div className="ev-card-no-estimate">
                    <PermissionGate roles={["owner", "editor"]}>
                        <CreateOrEditEventDialog
                            event={e}
                            trigger={
                                <button
                                    type="button"
                                    className="ev-card-est-link"
                                >
                                    Set an estimate
                                </button>
                            }
                        />
                    </PermissionGate>
                </div>
            )}
            <div className="ev-card-foot">
                <span style={{ fontSize: 11.5, color: "var(--fg-4)" }}>
                    Net{" "}
                    <Money
                        amount={net}
                        size={11.5}
                        variant={
                            net < 0
                                ? "expense"
                                : net > 0
                                  ? "income"
                                  : "muted"
                        }
                        signed={net !== 0}
                    />
                </span>
                <span style={{ display: "flex", gap: 6 }}>
                    <Link
                        to={ROUTES.spaceEventDetail(spaceId, e.eventId)}
                        className="od-btn od-btn-sm"
                    >
                        <Eye className="size-3" />
                        View
                    </Link>
                    <PermissionGate roles={["owner", "editor"]}>
                        <CreateOrEditEventDialog event={e} />
                        <EventStatusButton
                            eventId={e.eventId}
                            status={e.status}
                        />
                        <DeleteEventDialog
                            eventId={e.eventId}
                            linkedTransactionCount={e.txCount}
                        />
                    </PermissionGate>
                </span>
            </div>
        </div>
    );
}

function StatusFilterSegmented({
    value,
    onChange,
    counts,
}: {
    value: StatusFilter;
    onChange: (v: StatusFilter) => void;
    counts: { all: number; active: number; closed: number };
}) {
    const items: Array<{ key: StatusFilter; label: string; count: number }> = [
        { key: "all", label: "All", count: counts.all },
        { key: "active", label: "Active", count: counts.active },
        { key: "closed", label: "Closed", count: counts.closed },
    ];
    return (
        <div className="ev-seg">
            {items.map((it) => (
                <button
                    key={it.key}
                    type="button"
                    className={`ev-seg-btn${value === it.key ? " is-active" : ""}`}
                    onClick={() => onChange(it.key)}
                >
                    {it.label}
                    <span className="ev-seg-count">{it.count}</span>
                </button>
            ))}
        </div>
    );
}

function YearPicker({
    year,
    setYear,
    options,
}: {
    year: number;
    setYear: (y: number) => void;
    options: number[];
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button type="button" className="od-btn">
                    <CalendarDays className="size-3.5" /> {year}
                    <ChevronDown
                        className="size-3"
                        style={{ color: "var(--fg-4)" }}
                    />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className="orbit-design ev-popover w-32 p-1"
            >
                {options.map((y) => (
                    <button
                        key={y}
                        type="button"
                        className="ev-popover-item"
                        onClick={() => setYear(y)}
                    >
                        {y}
                        {year === y && (
                            <Check
                                className="ml-auto size-3.5"
                                style={{ color: "var(--brand)" }}
                            />
                        )}
                    </button>
                ))}
            </PopoverContent>
        </Popover>
    );
}

const EV_STYLES = `
.ev-root {
    margin: -1.5rem -1rem;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
}
@media (min-width: 768px) {
    .ev-root { margin: -2rem; }
}

.ev-topbar {
    padding: 26px 32px 18px;
    border-bottom: 1px solid var(--line-soft);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    background: var(--bg);
    flex-wrap: wrap;
}
.ev-topbar-text { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ev-title {
    font-size: 26px;
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--fg);
    margin: 0;
}
.ev-sub { font-size: 13px; color: var(--fg-3); margin: 0; }
.ev-topbar-actions {
    display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
}
@media (max-width: 720px) {
    .ev-topbar { padding: 18px 18px 14px; }
}

.ev-scroll {
    flex: 1;
    padding: 22px 32px 36px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}
@media (max-width: 720px) {
    .ev-scroll { padding: 16px 18px 28px; }
}

.ev-section { padding: 22px; }
.ev-sect-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
}
.ev-sect-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.ev-sect-title {
    font-size: 16px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--fg);
    margin: 0;
}
.ev-sect-sub { font-size: 12px; color: var(--fg-3); }

/* Segmented status filter */
.ev-seg {
    display: inline-flex;
    padding: 2px;
    border-radius: 8px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line-soft);
    gap: 2px;
}
.ev-seg-btn {
    border: 0;
    background: transparent;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--fg-3);
    cursor: pointer;
    font-family: inherit;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: background 120ms ease, color 120ms ease;
}
.ev-seg-btn:hover:not(.is-active) { color: var(--fg-2); }
.ev-seg-btn.is-active {
    background: var(--bg);
    color: var(--fg);
    box-shadow: 0 0 0 1px var(--line) inset;
}
.ev-seg-count {
    font-size: 10.5px;
    color: var(--fg-4);
    background: var(--bg-elev-3);
    border-radius: 999px;
    padding: 0 6px;
    line-height: 16px;
}
.ev-seg-btn.is-active .ev-seg-count { color: var(--fg-2); }

/* Timeline */
.ev-timeline {
    position: relative;
    height: 70px;
    margin-top: 8px;
}
.ev-timeline-axis {
    position: absolute;
    left: 0;
    right: 0;
    top: 32px;
    height: 2px;
    background: var(--line);
}
.ev-timeline-months {
    position: absolute;
    left: 0;
    right: 0;
    top: 38px;
    height: 24px;
}
.ev-timeline-month {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    font-size: 10px;
    color: var(--fg-4);
    letter-spacing: 0.06em;
}
.ev-timeline-pill {
    position: absolute;
    top: 8px;
    height: 22px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    padding: 0 6px;
    overflow: hidden;
    font-size: 10.5px;
    gap: 5px;
    white-space: nowrap;
    min-width: 6px;
}
.ev-timeline-pill-name {
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Card grid */
.ev-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
}
@media (max-width: 900px) {
    .ev-grid { grid-template-columns: 1fr; }
}
.orbit-design .od-card.ev-card {
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    transition: border-color 140ms ease;
}
.orbit-design .od-card.ev-card:hover {
    border-color: var(--line-strong);
}
.ev-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}
.ev-card-name {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
}
.ev-card-text {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    min-width: 0;
}
.ev-card-title {
    font-size: 14.5px;
    font-weight: 500;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ev-card-range {
    font-size: 11.5px;
    color: var(--fg-4);
}
.ev-card-calstate {
    color: var(--fg-4);
}
.ev-card-state {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    border: 1px solid;
    background: transparent;
}
.ev-card-stats {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 14px;
    padding: 12px 0;
    border-top: 1px solid var(--line-soft);
    border-bottom: 1px solid var(--line-soft);
}
.ev-metric {
    display: flex;
    flex-direction: column;
}
.ev-card-progress {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.ev-card-progress-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.ev-card-no-estimate {
    display: flex;
    justify-content: flex-start;
}
.ev-card-est-link {
    background: transparent;
    border: 0;
    padding: 0;
    font-size: 11.5px;
    color: var(--brand);
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    text-decoration: none;
}
.ev-card-est-link:hover { text-decoration: underline; }
.ev-card-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

/* Empty state */
.orbit-design .od-card.ev-empty {
    padding: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    text-align: center;
}

/* Year popover */
.ev-popover-item {
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    border-radius: 6px;
    background: transparent;
    border: 0;
    font-size: 13px;
    color: var(--fg-2);
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    gap: 8px;
}
.ev-popover-item:hover { background: var(--bg-elev-2); color: var(--fg); }

/* Phone (<640px) — tighten event cards. */
@media (max-width: 640px) {
    .ev-topbar { padding: 14px 14px 10px; }
    .ev-title { font-size: 22px; }
    .ev-scroll { padding: 12px 14px 22px; gap: 12px; }
    .ev-section { padding: 14px; }
    .ev-sect-head { margin-bottom: 10px; }
    .ev-card-stats { gap: 10px; padding: 10px 0; }
    .orbit-design .od-card.ev-card { padding: 14px; gap: 12px; }
    .orbit-design .od-card.ev-empty { padding: 24px; }
    .ev-seg {
        max-width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        flex-wrap: nowrap;
    }
    .ev-seg-btn { flex: 0 0 auto; }
}
@media (max-width: 380px) {
    .ev-card-stats { grid-template-columns: 1fr 1fr; }
    .ev-card-stats > :nth-child(3) { grid-column: span 2; }
}
`;
