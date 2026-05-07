import { useMemo, useState, type ReactNode } from "react";
import {
    CalendarDays,
    Plus,
    Trash2,
    Pencil,
    Eye,
    ChevronDown,
    Check,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EntityStyleFields } from "@/components/shared/EntityStyleFields";
import { FileUploadField } from "@/components/file-upload-field";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { DEFAULT_COLOR } from "@/lib/entityStyle";
import { toInputDateTime, fromInputDateTime } from "@/lib/dates";
import { formatInAppTz } from "@/lib/formatDate";
import type { RouterOutput } from "@/trpc";

type RawEventTotal = RouterOutput["analytics"]["eventTotals"][number];
type EventTotal = Omit<RawEventTotal, "startTime" | "endTime"> & {
    startTime: Date;
    endTime: Date;
};

type EventState = "Past" | "Recent" | "Active" | "Upcoming";

function eventState(start: Date, end: Date, now: Date): EventState {
    if (now < start) return "Upcoming";
    if (now > end) {
        const days = Math.round((now.getTime() - end.getTime()) / 86_400_000);
        return days <= 14 ? "Recent" : "Past";
    }
    return "Active";
}

export default function EventsPage() {
    const { space } = useCurrentSpace();
    const [year, setYear] = useState(() => new Date().getFullYear());
    const eventsQuery = trpc.analytics.eventTotals.useQuery({ spaceId: space.id });

    const events = useMemo<EventTotal[]>(() => {
        return (eventsQuery.data ?? []).map((ev) => ({
            ...ev,
            startTime: new Date(ev.startTime),
            endTime: new Date(ev.endTime),
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

    const sorted = useMemo(
        () => [...yearEvents].sort((a, b) => a.startTime.getTime() - b.startTime.getTime()),
        [yearEvents]
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
                            return (
                                <div
                                    key={e.eventId}
                                    className="ev-timeline-pill"
                                    style={{
                                        left: `${left}%`,
                                        width: `${width}%`,
                                        background: `color-mix(in oklab, ${e.color} 22%, transparent)`,
                                        border: `1px solid ${e.color}`,
                                        color: e.color,
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
                            No events in {year}
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
                        {sorted.map((e) => {
                            const state = eventState(e.startTime, e.endTime, now);
                            const stateTone =
                                state === "Active"
                                    ? "var(--brand)"
                                    : state === "Upcoming"
                                      ? "var(--gold)"
                                      : "var(--fg-3)";
                            const net = e.incomeTotal - e.expenseTotal;
                            return (
                                <div key={e.eventId} className="od-card ev-card">
                                    <div className="ev-card-head">
                                        <span className="ev-card-name">
                                            <EntityAvatar
                                                icon={e.icon}
                                                colorVar={e.color}
                                                size={36}
                                            />
                                            <span className="ev-card-text">
                                                <span className="ev-card-title">
                                                    {e.name}
                                                </span>
                                                <span className="ev-card-range">
                                                    {formatInAppTz(e.startTime, "MMM d")}{" "}
                                                    →{" "}
                                                    {formatInAppTz(e.endTime, "MMM d")}
                                                </span>
                                            </span>
                                        </span>
                                        <span
                                            className="ev-card-state"
                                            style={{
                                                color: stateTone,
                                                borderColor:
                                                    state === "Active"
                                                        ? "color-mix(in oklab, var(--brand) 30%, transparent)"
                                                        : state === "Upcoming"
                                                          ? "color-mix(in oklab, var(--gold) 30%, transparent)"
                                                          : "var(--line)",
                                            }}
                                        >
                                            {state}
                                        </span>
                                    </div>
                                    <div className="ev-card-stats">
                                        <Metric
                                            label="Spent"
                                            value={
                                                <Money
                                                    amount={e.expenseTotal}
                                                    size={16}
                                                    weight={500}
                                                    variant={
                                                        e.expenseTotal
                                                            ? "expense"
                                                            : "muted"
                                                    }
                                                />
                                            }
                                        />
                                        <Metric
                                            label="Received"
                                            value={
                                                <Money
                                                    amount={e.incomeTotal}
                                                    size={16}
                                                    weight={500}
                                                    variant={
                                                        e.incomeTotal
                                                            ? "income"
                                                            : "muted"
                                                    }
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
                                            <button
                                                type="button"
                                                className="od-btn od-btn-sm"
                                            >
                                                <Eye className="size-3" />
                                                View
                                            </button>
                                            <PermissionGate roles={["owner", "editor"]}>
                                                <CreateOrEditEventDialog event={e} />
                                                <DeleteEvent id={e.eventId} />
                                            </PermissionGate>
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
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

function Metric({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="ev-metric">
            <span className="eyebrow">{label}</span>
            <div style={{ marginTop: 4 }}>{value}</div>
        </div>
    );
}

function Money({
    amount,
    variant = "neutral",
    signed = false,
    size = 13,
    weight = 500,
    decimals = 2,
}: {
    amount: number;
    variant?: "neutral" | "income" | "expense" | "muted";
    signed?: boolean;
    size?: number;
    weight?: number;
    decimals?: number;
}) {
    const colorMap: Record<string, string> = {
        income: "var(--income)",
        expense: "var(--expense)",
        muted: "var(--fg-3)",
        neutral: "var(--fg)",
    };
    const abs = Math.abs(amount).toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
    let text = abs;
    if (amount < 0) text = "−" + abs;
    else if (signed && amount > 0) text = "+" + abs;
    return (
        <span
            className="tabular"
            style={{ color: colorMap[variant], fontSize: size, fontWeight: weight }}
        >
            {text}
        </span>
    );
}

function EntityAvatar({
    icon,
    colorVar,
    size = 32,
}: {
    icon: string;
    colorVar: string;
    size?: number;
}) {
    return (
        <span
            style={{
                width: size,
                height: size,
                borderRadius: 8,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: `color-mix(in oklab, ${colorVar} 18%, transparent)`,
                border: `1px solid color-mix(in oklab, ${colorVar} 30%, transparent)`,
                color: colorVar,
                flexShrink: 0,
            }}
        >
            <DesignIcon name={icon} size={size * 0.5} color={colorVar} />
        </span>
    );
}

const ICON_PATHS: Record<string, string> = {
    home: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
    plane: "m3 13 7-1 4-7 2 1-2 7 7 4-1 2-7-3-3 4-2 1 1-3z",
    gift: "M4 11h16v9H4zM3 7h18v4H3zm9-3a2 2 0 0 0-2 2v1h4V6a2 2 0 0 0-2-2zm0 0v16",
    heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
    star: "m12 3 2.7 5.6 6 .7-4.4 4.3 1.2 6.1L12 16.8 6.5 19.7l1.2-6.1L3.3 9.3l6-.7z",
    "calendar-days":
        "M5 5h14v14H5zM5 9h14M9 3v4M15 3v4",
    calendar: "M5 5h14v14H5zM5 9h14M9 3v4M15 3v4",
    dot: "M12 12h.01",
};

function DesignIcon({
    name,
    size,
    color,
}: {
    name: string;
    size: number;
    color: string;
}) {
    const d = ICON_PATHS[name] ?? ICON_PATHS.calendar;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d={d} />
        </svg>
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

/* ============================================================
   Dialogs (preserved from previous impl + trigger prop)
   ============================================================ */

function CreateOrEditEventDialog({
    event,
    trigger,
}: {
    event?: EventTotal;
    trigger?: ReactNode;
}) {
    const { space } = useCurrentSpace();
    const editing = !!event;
    const [open, setOpen] = useState(false);
    const [name, setName] = useState(event?.name ?? "");
    const [start, setStart] = useState(toInputDateTime(event?.startTime ?? null));
    const [end, setEnd] = useState(toInputDateTime(event?.endTime ?? null));
    const [color, setColor] = useState(event?.color ?? DEFAULT_COLOR);
    const [icon, setIcon] = useState(event?.icon ?? "calendar-days");
    const [description, setDescription] = useState(event?.description ?? "");
    const [attachmentFileIds, setAttachmentFileIds] = useState<string[]>([]);
    const utils = trpc.useUtils();

    const invalidate = async () => {
        await utils.event.listBySpace.invalidate({ spaceId: space.id });
        await utils.analytics.eventTotals.invalidate({ spaceId: space.id });
    };

    const create = trpc.event.create.useMutation({
        onSuccess: async () => {
            toast.success("Event created");
            await invalidate();
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });
    const update = trpc.event.update.useMutation({
        onSuccess: async () => {
            toast.success("Event updated");
            await invalidate();
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });
    const pending = create.isPending || update.isPending;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ??
                    (editing ? (
                        <Button size="icon" variant="ghost" className="size-7">
                            <Pencil className="size-3.5" />
                        </Button>
                    ) : (
                        <Button variant="gradient">
                            <Plus />
                            New event
                        </Button>
                    ))}
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{editing ? "Edit event" : "Create event"}</DialogTitle>
                    <DialogDescription>
                        Events group related transactions (weddings, trips, etc).
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="grid gap-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!name.trim() || !start || !end) return;
                        if (editing) {
                            update.mutate({
                                eventId: event!.eventId,
                                name: name.trim(),
                                startTime: fromInputDateTime(start),
                                endTime: fromInputDateTime(end),
                                color,
                                icon,
                                description: description.trim() || null,
                                addAttachmentFileIds:
                                    attachmentFileIds.length > 0
                                        ? attachmentFileIds
                                        : undefined,
                            });
                        } else {
                            create.mutate({
                                spaceId: space.id,
                                name: name.trim(),
                                startTime: fromInputDateTime(start),
                                endTime: fromInputDateTime(end),
                                color,
                                icon,
                                description: description.trim() || undefined,
                                attachmentFileIds:
                                    attachmentFileIds.length > 0
                                        ? attachmentFileIds
                                        : undefined,
                            });
                        }
                    }}
                >
                    <div className="grid gap-1.5">
                        <Label htmlFor="ev-name">Name</Label>
                        <Input
                            id="ev-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            autoFocus
                        />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="ev-start">Starts</Label>
                            <Input
                                id="ev-start"
                                type="datetime-local"
                                value={start}
                                onChange={(e) => setStart(e.target.value)}
                                required
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="ev-end">Ends</Label>
                            <Input
                                id="ev-end"
                                type="datetime-local"
                                value={end}
                                onChange={(e) => setEnd(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="ev-desc">Description (optional)</Label>
                        <Textarea
                            id="ev-desc"
                            rows={2}
                            maxLength={2000}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                    <EntityStyleFields
                        name={name}
                        color={color}
                        setColor={setColor}
                        icon={icon}
                        setIcon={setIcon}
                    />
                    <FileUploadField
                        purpose="event_attachment"
                        fileIds={attachmentFileIds}
                        onChange={setAttachmentFileIds}
                    />
                    <DialogFooter className="gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" variant="gradient" disabled={pending}>
                            {pending ? "Saving…" : editing ? "Save" : "Create"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function DeleteEvent({ id }: { id: string }) {
    const { space } = useCurrentSpace();
    const utils = trpc.useUtils();
    const del = trpc.event.delete.useMutation({
        onSuccess: async () => {
            toast.success("Event deleted");
            await utils.event.listBySpace.invalidate({ spaceId: space.id });
            await utils.analytics.eventTotals.invalidate({ spaceId: space.id });
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <ConfirmDialog
            trigger={
                <Button size="icon" variant="ghost" className="size-7">
                    <Trash2 className="size-3.5 text-destructive" />
                </Button>
            }
            title="Delete event?"
            confirmLabel="Delete"
            destructive
            onConfirm={() => del.mutate({ eventId: id })}
        />
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
`;
