import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, FileText, Receipt } from "lucide-react";
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
import type { EventStatus, EventTotal } from "./types";

export default function EventDetailPage() {
    const { eventId = "" } = useParams<{ eventId: string }>();
    const { space } = useCurrentSpace();

    const eventQuery = trpc.event.getById.useQuery({ eventId }, { enabled: !!eventId });
    /* Use analytics.eventTotals (narrowed to this event) so the "Spent"
       number on the detail page matches the card on the list. */
    const totalsQuery = trpc.analytics.eventTotals.useQuery(
        { spaceId: space.id, eventId },
        { enabled: !!eventId }
    );
    const eventTotalsRow = totalsQuery.data?.[0];
    const breakdownQuery = trpc.analytics.eventCategoryBreakdown.useQuery(
        { eventId },
        { enabled: !!eventId }
    );
    const filesQuery = trpc.file.listForEvent.useQuery(
        { eventId },
        { enabled: !!eventId }
    );

    const [txCursor, setTxCursor] = useState<string | null>(null);
    const [accumulated, setAccumulated] = useState<TxRow[]>([]);
    const txQuery = trpc.transaction.listBySpace.useQuery(
        {
            spaceId: space.id,
            eventId,
            cursor: txCursor,
            limit: 50,
        },
        {
            enabled: !!eventId,
        }
    );

    /* Concatenate pages as the user clicks "Load more". Reset when the
       event changes. */
    useEffect(() => {
        setAccumulated([]);
        setTxCursor(null);
    }, [eventId]);

    useEffect(() => {
        if (!txQuery.data) return;
        setAccumulated((prev) => {
            const seen = new Set(prev.map((r) => r.id));
            const next = [...prev];
            for (const item of txQuery.data!.items as unknown as TxRow[]) {
                if (!seen.has(item.id)) next.push(item);
            }
            return next;
        });
    }, [txQuery.data]);

    const event = useMemo<EventTotal | null>(() => {
        if (!eventQuery.data) return null;
        const d = eventQuery.data;
        return {
            eventId: d.id,
            name: d.name,
            color: d.color,
            icon: d.icon,
            startTime: new Date(d.start_time),
            endTime: new Date(d.end_time),
            description: d.description,
            estimatedAmount:
                d.estimated_amount === null ? null : Number(d.estimated_amount),
            status: d.status as EventStatus,
            closedAt: d.closed_at ? new Date(d.closed_at) : null,
            expenseTotal: eventTotalsRow?.expenseTotal ?? 0,
            incomeTotal: eventTotalsRow?.incomeTotal ?? 0,
            txCount: eventTotalsRow?.txCount ?? 0,
        };
    }, [eventQuery.data, eventTotalsRow]);

    return (
        <div className="orbit-design ev-root">
            <style>{ED_STYLES}</style>

            <header className="ev-detail-topbar">
                <Link to={ROUTES.spaceEvents(space.id)} className="ev-back">
                    <ArrowLeft className="size-3.5" /> Events
                </Link>
            </header>

            <div className="ev-detail-scroll">
                {eventQuery.isLoading || !event ? (
                    <>
                        <Skeleton height={120} />
                        <Skeleton height={140} />
                        <Skeleton height={220} />
                    </>
                ) : eventQuery.isError ? (
                    <div className="od-card ev-detail-empty">
                        <CalendarDays
                            className="size-6"
                            style={{ color: "var(--fg-4)" }}
                        />
                        <div style={{ fontSize: 14, color: "var(--fg-2)", fontWeight: 500 }}>
                            Event not found
                        </div>
                        <Link to={ROUTES.spaceEvents(space.id)} className="od-btn od-btn-sm">
                            <ArrowLeft className="size-3" /> Back to events
                        </Link>
                    </div>
                ) : (
                    <>
                        <EventHeaderCard event={event} />
                        {event.description && (
                            <div className="od-card ev-detail-desc">
                                <span className="eyebrow">Description</span>
                                <p>{event.description}</p>
                            </div>
                        )}
                        <BudgetCard event={event} />
                        <CategoryBreakdownCard
                            data={breakdownQuery.data}
                            isLoading={breakdownQuery.isLoading}
                        />
                        <TransactionsCard
                            transactions={accumulated}
                            isLoading={txQuery.isLoading && accumulated.length === 0}
                            isFetching={txQuery.isFetching}
                            nextCursor={txQuery.data?.nextCursor ?? null}
                            onLoadMore={(c) => setTxCursor(c)}
                            color={event.color}
                            eventClosed={event.status === "closed"}
                        />
                        {(filesQuery.data?.length ?? 0) > 0 && (
                            <AttachmentsCard files={filesQuery.data ?? []} />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function EventHeaderCard({ event }: { event: EventTotal }) {
    const closed = event.status === "closed";

    return (
        <div className="od-card ev-detail-header">
            <div className="ev-detail-header-left">
                <EntityAvatar icon={event.icon} colorVar={event.color} size={56} />
                <div className="ev-detail-header-meta">
                    <span className="eyebrow">Event</span>
                    <h1 className="display ev-detail-title">{event.name}</h1>
                    <div className="ev-detail-header-row">
                        <span className="ev-detail-range">
                            <CalendarDays
                                className="size-3.5"
                                style={{ color: "var(--fg-4)" }}
                            />
                            {formatInAppTz(event.startTime, "MMM d, yyyy")} →{" "}
                            {formatInAppTz(event.endTime, "MMM d, yyyy")}
                        </span>
                        <span
                            className="ev-detail-state"
                            style={{
                                color: closed ? "var(--fg-3)" : "var(--brand)",
                                borderColor: closed
                                    ? "var(--line)"
                                    : "color-mix(in oklab, var(--brand) 30%, transparent)",
                            }}
                        >
                            {closed ? "Closed" : "Active"}
                        </span>
                    </div>
                    {closed && event.closedAt && (
                        <span className="ev-detail-closed-at">
                            Closed {formatInAppTz(event.closedAt, "MMM d, yyyy")}
                        </span>
                    )}
                </div>
            </div>
            <PermissionGate roles={["owner", "editor"]}>
                <div className="ev-detail-header-actions">
                    <CreateOrEditEventDialog
                        event={event}
                        trigger={
                            <button type="button" className="od-btn od-btn-sm">
                                Edit
                            </button>
                        }
                    />
                    <EventStatusButton
                        eventId={event.eventId}
                        status={event.status}
                        variant="labeled"
                    />
                    <DeleteEventDialog
                        eventId={event.eventId}
                        linkedTransactionCount={event.txCount}
                        trigger={
                            <button
                                type="button"
                                className="od-btn od-btn-sm"
                                style={{ color: "var(--expense)" }}
                            >
                                Delete
                            </button>
                        }
                    />
                </div>
            </PermissionGate>
        </div>
    );
}

function BudgetCard({ event }: { event: EventTotal }) {
    const net = event.incomeTotal - event.expenseTotal;
    const hasEstimate =
        event.estimatedAmount !== null && event.estimatedAmount > 0;
    const overByOrLeft = hasEstimate
        ? event.expenseTotal - (event.estimatedAmount as number)
        : 0;
    const pct = hasEstimate
        ? (event.expenseTotal / (event.estimatedAmount as number)) * 100
        : 0;
    const closed = event.status === "closed";

    return (
        <div className="od-card ev-detail-section">
            <div className="ev-sect-head">
                <div className="ev-sect-text">
                    <h2 className="display ev-sect-title">
                        {closed ? "Final budget" : "Budget"}
                    </h2>
                    <span className="ev-sect-sub">
                        {closed
                            ? "Spent vs. estimated · retrospective"
                            : "Track spend against the estimate"}
                    </span>
                </div>
            </div>
            <div className="ev-detail-kpis">
                <Metric
                    label={closed ? "Final spend" : "Spent"}
                    value={
                        <Money
                            amount={event.expenseTotal}
                            size={20}
                            weight={500}
                            variant={event.expenseTotal ? "expense" : "muted"}
                        />
                    }
                />
                <Metric
                    label="Estimate"
                    value={
                        event.estimatedAmount === null ? (
                            <span style={{ fontSize: 20, color: "var(--fg-4)" }}>
                                —
                            </span>
                        ) : (
                            <Money
                                amount={event.estimatedAmount}
                                size={20}
                                weight={500}
                            />
                        )
                    }
                />
                <Metric
                    label="Net"
                    value={
                        <Money
                            amount={net}
                            size={20}
                            weight={500}
                            variant={
                                net < 0 ? "expense" : net > 0 ? "income" : "muted"
                            }
                            signed={net !== 0}
                        />
                    }
                />
                <Metric
                    label={closed ? "Income (final)" : "Income"}
                    value={
                        <Money
                            amount={event.incomeTotal}
                            size={20}
                            weight={500}
                            variant={event.incomeTotal ? "income" : "muted"}
                        />
                    }
                />
            </div>
            {hasEstimate ? (
                <>
                    <EstimateProgressBar
                        spent={event.expenseTotal}
                        estimate={event.estimatedAmount as number}
                        height={8}
                    />
                    <div className="ev-detail-progress-row">
                        <span style={{ fontSize: 12.5, color: "var(--fg-2)" }}>
                            {closed ? "Final: " : ""}
                            <Money amount={event.expenseTotal} size={12.5} weight={500} />{" "}
                            of{" "}
                            <Money
                                amount={event.estimatedAmount as number}
                                size={12.5}
                                weight={500}
                            />{" "}
                            <span style={{ color: "var(--fg-4)" }}>
                                · {pct.toFixed(0)}% used
                            </span>
                        </span>
                        <span
                            style={{
                                fontSize: 12.5,
                                color:
                                    overByOrLeft > 0
                                        ? "var(--expense)"
                                        : "var(--fg-3)",
                                fontWeight: 500,
                            }}
                        >
                            {overByOrLeft > 0 ? (
                                <>
                                    +<Money amount={overByOrLeft} size={12.5} variant="expense" />{" "}
                                    over
                                </>
                            ) : (
                                <>
                                    <Money amount={-overByOrLeft} size={12.5} /> left
                                </>
                            )}
                        </span>
                    </div>
                </>
            ) : (
                <div className="ev-detail-set-est">
                    <span style={{ fontSize: 13, color: "var(--fg-3)" }}>
                        Set an estimate to track spent-vs-budget.
                    </span>
                    <PermissionGate roles={["owner", "editor"]}>
                        <CreateOrEditEventDialog
                            event={event}
                            trigger={
                                <button type="button" className="od-btn od-btn-sm">
                                    Set estimate
                                </button>
                            }
                        />
                    </PermissionGate>
                </div>
            )}
        </div>
    );
}

type BreakdownRow = {
    categoryId: string;
    categoryName: string;
    color: string;
    icon: string;
    total: number;
    txCount: number;
};

function CategoryBreakdownCard({
    data,
    isLoading,
}: {
    data: BreakdownRow[] | undefined;
    isLoading: boolean;
}) {
    if (isLoading) return <Skeleton height={160} />;
    if (!data || data.length === 0) return null;
    const max = data.reduce((m, r) => Math.max(m, r.total), 0);

    return (
        <div className="od-card ev-detail-section">
            <div className="ev-sect-head">
                <div className="ev-sect-text">
                    <h2 className="display ev-sect-title">Spending by category</h2>
                    <span className="ev-sect-sub">Across this event</span>
                </div>
            </div>
            <div className="ev-detail-breakdown">
                {data.map((row) => {
                    const widthPct = max > 0 ? (row.total / max) * 100 : 0;
                    return (
                        <div key={row.categoryId} className="ev-bd-row">
                            <span className="ev-bd-name">
                                <span
                                    className="ev-bd-dot"
                                    style={{ background: row.color }}
                                    aria-hidden
                                >
                                    <DesignIcon
                                        name={row.icon}
                                        size={9}
                                        color="#fff"
                                    />
                                </span>
                                {row.categoryName}
                            </span>
                            <span className="ev-bd-bar">
                                <span
                                    className="ev-bd-fill"
                                    style={{
                                        width: `${widthPct}%`,
                                        background: `color-mix(in oklab, ${row.color} 60%, transparent)`,
                                    }}
                                />
                            </span>
                            <span className="ev-bd-amt">
                                <Money amount={row.total} size={12.5} weight={500} />
                                <span
                                    className="ev-bd-count"
                                    style={{ color: "var(--fg-4)" }}
                                >
                                    {row.txCount}{" "}
                                    {row.txCount === 1 ? "tx" : "txs"}
                                </span>
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

type TxRow = {
    id: string;
    type: string;
    amount: string | number;
    description: string | null;
    location: string | null;
    transaction_datetime: string | Date;
};

function TransactionsCard({
    transactions,
    isLoading,
    isFetching,
    nextCursor,
    onLoadMore,
    color,
    eventClosed,
}: {
    transactions: TxRow[];
    isLoading: boolean;
    isFetching: boolean;
    nextCursor: string | null;
    onLoadMore: (cursor: string) => void;
    color: string;
    eventClosed: boolean;
}) {
    return (
        <div className="od-card ev-detail-section">
            <div className="ev-sect-head">
                <div className="ev-sect-text">
                    <h2 className="display ev-sect-title">Transactions</h2>
                    <span className="ev-sect-sub">
                        {transactions.length} linked
                    </span>
                </div>
            </div>
            {isLoading ? (
                <Skeleton height={120} />
            ) : transactions.length === 0 ? (
                <div className="ev-detail-tx-empty">
                    <Receipt
                        className="size-6"
                        style={{ color: "var(--fg-4)" }}
                    />
                    <div style={{ fontSize: 13.5, color: "var(--fg-2)" }}>
                        No transactions linked.
                    </div>
                    <div style={{ fontSize: 12, color: "var(--fg-4)" }}>
                        {eventClosed
                            ? "This event is closed — reopen it to link new transactions."
                            : "Add transactions to this event from the New Transaction form."}
                    </div>
                </div>
            ) : (
                <>
                    <div className="ev-detail-tx-list">
                        {transactions.map((t) => {
                            const type = String(t.type);
                            const num = Number(t.amount);
                            const signed = type === "expense" ? -num : num;
                            const variant =
                                type === "income"
                                    ? "income"
                                    : type === "expense"
                                      ? "expense"
                                      : "muted";
                            return (
                                <div key={t.id} className="ev-detail-tx-row">
                                    <span className="ev-detail-tx-date">
                                        <span
                                            className="ev-detail-tx-marker"
                                            style={{ background: color }}
                                            aria-hidden
                                        />
                                        <span>
                                            {formatInAppTz(
                                                new Date(t.transaction_datetime),
                                                "MMM d"
                                            )}
                                        </span>
                                    </span>
                                    <span className="ev-detail-tx-desc">
                                        <span className="ev-detail-tx-desc-line">
                                            {t.description?.trim() || (
                                                <span style={{ color: "var(--fg-4)" }}>
                                                    No description
                                                </span>
                                            )}
                                        </span>
                                        <span className="ev-detail-tx-type">
                                            {type}
                                            {t.location ? ` · ${t.location}` : ""}
                                        </span>
                                    </span>
                                    <span className="ev-detail-tx-amt">
                                        <Money
                                            amount={signed}
                                            variant={variant}
                                            signed={type === "income"}
                                            size={13.5}
                                            weight={500}
                                        />
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    {nextCursor && (
                        <div className="ev-detail-load-more">
                            <button
                                type="button"
                                className="od-btn od-btn-sm"
                                onClick={() => onLoadMore(nextCursor)}
                                disabled={isFetching}
                            >
                                {isFetching ? "Loading…" : "Load more"}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

type AttachmentRow = {
    id: string;
    originalName: string;
    sizeBytes: number;
};

function AttachmentsCard({ files }: { files: AttachmentRow[] }) {
    return (
        <div className="od-card ev-detail-section">
            <div className="ev-sect-head">
                <div className="ev-sect-text">
                    <h2 className="display ev-sect-title">Attachments</h2>
                    <span className="ev-sect-sub">{files.length} file(s)</span>
                </div>
            </div>
            <div className="ev-detail-files">
                {files.map((f) => (
                    <span key={f.id} className="ev-detail-file">
                        <FileText
                            className="size-3.5"
                            style={{ color: "var(--fg-3)" }}
                        />
                        <span className="ev-detail-file-name">
                            {f.originalName}
                        </span>
                        <span className="ev-detail-file-size">
                            {formatBytes(f.sizeBytes)}
                        </span>
                    </span>
                ))}
            </div>
        </div>
    );
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ED_STYLES = `
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

.ev-detail-topbar {
    padding: 20px 32px 12px;
    border-bottom: 1px solid var(--line-soft);
    display: flex;
    align-items: center;
    background: var(--bg);
}
@media (max-width: 720px) {
    .ev-detail-topbar { padding: 14px 18px 10px; }
}
.ev-back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--fg-3);
    font-size: 12.5px;
    text-decoration: none;
    padding: 4px 8px;
    border-radius: 6px;
}
.ev-back:hover {
    color: var(--fg);
    background: var(--bg-elev-2);
}

.ev-detail-scroll {
    flex: 1;
    padding: 18px 32px 36px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}
@media (max-width: 720px) {
    .ev-detail-scroll { padding: 14px 18px 28px; }
}

.orbit-design .od-card.ev-detail-header {
    padding: 22px;
    display: flex;
    gap: 16px;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
}
.ev-detail-header-left {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
    flex: 1;
}
.ev-detail-header-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}
.ev-detail-title {
    font-size: 22px;
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--fg);
    margin: 0;
}
.ev-detail-header-row {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 2px;
}
.ev-detail-range {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
    color: var(--fg-3);
}
.ev-detail-state {
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
.ev-detail-closed-at {
    font-size: 11.5px;
    color: var(--fg-4);
    margin-top: 2px;
}
.ev-detail-header-actions {
    display: inline-flex;
    gap: 6px;
    flex-wrap: wrap;
}

.orbit-design .od-card.ev-detail-desc {
    padding: 18px 22px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.orbit-design .od-card.ev-detail-desc p {
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--fg-2);
    margin: 0;
    white-space: pre-wrap;
}

.orbit-design .od-card.ev-detail-section {
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}
.ev-sect-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
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

.ev-detail-kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    padding: 12px 0;
    border-top: 1px solid var(--line-soft);
    border-bottom: 1px solid var(--line-soft);
}
@media (max-width: 720px) {
    .ev-detail-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.ev-detail-progress-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.ev-detail-set-est {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.ev-detail-breakdown {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.ev-bd-row {
    display: grid;
    grid-template-columns: minmax(120px, 1.6fr) 3fr auto;
    align-items: center;
    gap: 12px;
}
.ev-bd-name {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    color: var(--fg-2);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ev-bd-dot {
    width: 18px;
    height: 18px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.ev-bd-bar {
    position: relative;
    width: 100%;
    height: 8px;
    border-radius: 999px;
    background: color-mix(in oklab, var(--line) 60%, transparent);
    overflow: hidden;
}
.ev-bd-fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 999px;
    transition: width 200ms ease;
}
.ev-bd-amt {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    line-height: 1.1;
}
.ev-bd-count { font-size: 11px; }

.ev-detail-tx-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 30px 12px;
    text-align: center;
}
.ev-detail-tx-list {
    display: flex;
    flex-direction: column;
}
.ev-detail-tx-row {
    display: grid;
    grid-template-columns: 90px 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 10px 4px;
    border-bottom: 1px solid var(--line-soft);
}
.ev-detail-tx-row:last-child { border-bottom: 0; }
.ev-detail-tx-date {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--fg-3);
}
.ev-detail-tx-marker {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    flex-shrink: 0;
}
.ev-detail-tx-desc {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
    min-width: 0;
}
.ev-detail-tx-desc-line {
    font-size: 13px;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ev-detail-tx-type {
    font-size: 11.5px;
    color: var(--fg-4);
    text-transform: capitalize;
}
.ev-detail-tx-amt {
    text-align: right;
}
.ev-detail-load-more {
    display: flex;
    justify-content: center;
    padding-top: 10px;
}

.ev-detail-files {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.ev-detail-file {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg-elev-1);
    font-size: 12px;
    color: var(--fg-2);
}
.ev-detail-file-name {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ev-detail-file-size { color: var(--fg-4); font-size: 11px; }

.orbit-design .od-card.ev-detail-empty {
    padding: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    text-align: center;
}

/* Phone (<640px) — tighten header, sections, breakdown, tx list. */
@media (max-width: 640px) {
    .ev-detail-topbar { padding: 12px 14px 8px; }
    .ev-detail-scroll { padding: 12px 14px 22px; gap: 12px; }
    .orbit-design .od-card.ev-detail-header { padding: 14px; gap: 12px; }
    .ev-detail-header-left { gap: 12px; }
    .ev-detail-title { font-size: 18px; }
    .ev-detail-header-actions { gap: 6px; }
    .orbit-design .od-card.ev-detail-section { padding: 14px; gap: 12px; }
    .orbit-design .od-card.ev-detail-desc { padding: 14px; }
    .ev-detail-kpis { gap: 10px; padding: 10px 0; }
    .ev-bd-row {
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
    }
    .ev-bd-bar { grid-column: 1 / -1; }
    .ev-detail-tx-row {
        grid-template-columns: 1fr auto;
        gap: 8px;
        padding: 10px 2px;
    }
    .ev-detail-tx-date { grid-column: 1 / -1; }
    .ev-detail-file-name { max-width: 140px; }
    .orbit-design .od-card.ev-detail-empty { padding: 24px; }
}
@media (max-width: 380px) {
    .ev-detail-kpis { grid-template-columns: 1fr; }
}
`;
