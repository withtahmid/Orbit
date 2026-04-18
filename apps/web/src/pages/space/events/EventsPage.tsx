import { useMemo, useState } from "react";
import { CalendarDays, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { EntityStyleFields } from "@/components/shared/EntityStyleFields";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { DEFAULT_COLOR } from "@/lib/entityStyle";
import { toInputDateTime, fromInputDateTime } from "@/lib/dates";
import { formatInAppTz } from "@/lib/formatDate";

type RawEventTotal = NonNullable<
    ReturnType<typeof trpc.analytics.eventTotals.useQuery>["data"]
>[number];
type EventTotal = Omit<RawEventTotal, "startTime" | "endTime"> & {
    startTime: Date;
    endTime: Date;
};

export default function EventsPage() {
    const { space } = useCurrentSpace();
    const eventsQuery = trpc.analytics.eventTotals.useQuery({ spaceId: space.id });

    const events = useMemo<EventTotal[]>(() => {
        // tRPC serializes Date → ISO string over HTTP even though the
        // type claims Date. Rehydrate once at the edge so date-fns calls
        // downstream don't crash with `d.getFullYear is not a function`.
        return (eventsQuery.data ?? []).map((ev) => ({
            ...ev,
            startTime: new Date(ev.startTime),
            endTime: new Date(ev.endTime),
        }));
    }, [eventsQuery.data]);

    const groups = useMemo(() => {
        const map = new Map<string, EventTotal[]>();
        for (const ev of events) {
            const key = formatInAppTz(ev.startTime, "yyyy-MM");
            const arr = map.get(key) ?? [];
            arr.push(ev);
            map.set(key, arr);
        }
        return Array.from(map.entries());
    }, [events]);

    return (
        <div className="grid gap-5 sm:gap-6">
            <PageHeader
                title="Events"
                description="Group transactions under named occasions"
                actions={
                    <PermissionGate roles={["owner", "editor"]}>
                        <CreateOrEditEventDialog />
                    </PermissionGate>
                }
            />

            {eventsQuery.isLoading ? (
                <div className="grid gap-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full rounded-xl" />
                    ))}
                </div>
            ) : !eventsQuery.data || eventsQuery.data.length === 0 ? (
                <EmptyState
                    icon={CalendarDays}
                    title="No events yet"
                    description="Events help group related transactions (weddings, trips, etc.)."
                    action={
                        <PermissionGate roles={["owner", "editor"]}>
                            <CreateOrEditEventDialog />
                        </PermissionGate>
                    }
                />
            ) : (
                <div className="grid gap-5">
                    {groups.map(([key, evs]) => (
                        <div key={key}>
                            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {formatInAppTz(new Date(key + "-01T00:00:00Z"), "MMMM yyyy")}
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {evs.map((ev) => (
                                    <Card
                                        key={ev.eventId}
                                        className="transition-colors hover:border-foreground/20"
                                        style={{ borderLeft: `3px solid ${ev.color}` }}
                                    >
                                        <CardContent className="p-4">
                                            <div className="flex items-start gap-3">
                                                <EntityAvatar
                                                    color={ev.color}
                                                    icon={ev.icon}
                                                    size="md"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate font-semibold">
                                                        {ev.name}
                                                    </p>
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        {formatInAppTz(ev.startTime, "MMM d HH:mm")}{" "}
                                                        →{" "}
                                                        {formatInAppTz(ev.endTime, "MMM d HH:mm")}
                                                    </p>
                                                    {ev.description && (
                                                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                                            {ev.description}
                                                        </p>
                                                    )}
                                                </div>
                                                <PermissionGate roles={["owner", "editor"]}>
                                                    <div className="flex">
                                                        <CreateOrEditEventDialog event={ev} />
                                                        <DeleteEvent id={ev.eventId} />
                                                    </div>
                                                </PermissionGate>
                                            </div>
                                            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                                                <Metric
                                                    label="Expenses"
                                                    value={
                                                        <MoneyDisplay
                                                            amount={ev.expenseTotal}
                                                            variant="expense"
                                                            className="text-sm font-semibold"
                                                        />
                                                    }
                                                />
                                                <Metric
                                                    label="Income"
                                                    value={
                                                        <MoneyDisplay
                                                            amount={ev.incomeTotal}
                                                            variant="income"
                                                            className="text-sm font-semibold"
                                                        />
                                                    }
                                                />
                                                <Metric
                                                    label="Transactions"
                                                    value={
                                                        <span className="text-sm font-semibold">
                                                            {ev.txCount}
                                                        </span>
                                                    }
                                                />
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <div>{value}</div>
        </div>
    );
}

function CreateOrEditEventDialog({ event }: { event?: EventTotal }) {
    const { space } = useCurrentSpace();
    const editing = !!event;
    const [open, setOpen] = useState(false);
    const [name, setName] = useState(event?.name ?? "");
    const [start, setStart] = useState(toInputDateTime(event?.startTime ?? null));
    const [end, setEnd] = useState(toInputDateTime(event?.endTime ?? null));
    const [color, setColor] = useState(event?.color ?? DEFAULT_COLOR);
    const [icon, setIcon] = useState(event?.icon ?? "calendar-days");
    const [description, setDescription] = useState(event?.description ?? "");
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
                {editing ? (
                    <Button size="icon" variant="ghost" className="size-7">
                        <Pencil className="size-3.5" />
                    </Button>
                ) : (
                    <Button variant="gradient">
                        <Plus />
                        New event
                    </Button>
                )}
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
