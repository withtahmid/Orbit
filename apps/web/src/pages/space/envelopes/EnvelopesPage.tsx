import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Plus, Trash2, Pencil, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { EntityStyleFields } from "@/components/shared/EntityStyleFields";
import { EnvelopeAllocateDialog } from "@/features/allocations/EnvelopeAllocateDialog";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import { DEFAULT_COLOR } from "@/lib/entityStyle";
import { cn } from "@/lib/utils";

import type { RouterOutput } from "@/trpc";

type Cadence = "none" | "monthly";
type EnvelopeRow = RouterOutput["analytics"]["envelopeUtilization"][number];

export default function EnvelopesPage() {
    const { space } = useCurrentSpace();

    // For monthly envelopes, show this month's numbers. For 'none' envelopes,
    // the server ignores the period window. We leave periodStart/periodEnd
    // unset so cadence='none' envelopes show lifetime.
    const utilizationQuery = trpc.analytics.envelopeUtilization.useQuery({
        spaceId: space.id,
    });

    return (
        <div className="grid gap-5 sm:gap-6">
            <PageHeader
                title="Envelopes"
                description="Budget buckets. Monthly envelopes reset each month; rolling envelopes accumulate."
                actions={
                    <PermissionGate roles={["owner"]}>
                        <CreateOrEditEnvelopeDialog />
                    </PermissionGate>
                }
            />

            {utilizationQuery.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-44 rounded-xl" />
                    ))}
                </div>
            ) : !utilizationQuery.data || utilizationQuery.data.length === 0 ? (
                <EmptyState
                    icon={Mail}
                    title="No envelopes yet"
                    description="Create an envelope to start budgeting."
                    action={
                        <PermissionGate roles={["owner"]}>
                            <CreateOrEditEnvelopeDialog />
                        </PermissionGate>
                    }
                />
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {utilizationQuery.data.map((e) => (
                        <EnvelopeCard key={e.envelopId} envelope={e} />
                    ))}
                </div>
            )}
        </div>
    );
}

function EnvelopeCard({ envelope: e }: { envelope: EnvelopeRow }) {
    const { space } = useCurrentSpace();
    const rawPct =
        e.allocated > 0
            ? (e.consumed / e.allocated) * 100
            : e.consumed > 0
              ? Infinity
              : 0;
    const periodPct = Math.min(100, rawPct);
    const level =
        rawPct > 100
            ? "over"
            : rawPct > 90
              ? "danger"
              : rawPct > 70
                ? "warn"
                : "ok";

    const driftingPartitions = e.breakdown.filter((b) => b.isDrift);

    return (
        <Card
            className="overflow-hidden transition-colors hover:border-foreground/20"
            style={{
                borderTop: `3px solid ${e.color}`,
            }}
        >
            <CardContent className="grid gap-3 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                    <Link
                        to={ROUTES.spaceEnvelopeDetail(space.id, e.envelopId)}
                        className="-mx-1 flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 hover:bg-accent/30"
                    >
                        <EntityAvatar color={e.color} icon={e.icon} size="md" />
                        <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate font-semibold">
                                {e.name}
                                {e.cadence === "monthly" && (
                                    <span className="rounded-sm bg-secondary px-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                        Monthly
                                    </span>
                                )}
                            </p>
                            {e.description && (
                                <p className="truncate text-xs text-muted-foreground">
                                    {e.description}
                                </p>
                            )}
                        </div>
                    </Link>
                    <PermissionGate roles={["owner"]}>
                        <div className="flex">
                            <CreateOrEditEnvelopeDialog
                                envelope={{
                                    envelopId: e.envelopId,
                                    name: e.name,
                                    color: e.color,
                                    icon: e.icon,
                                    description: e.description,
                                    cadence: e.cadence,
                                    carryOver: e.carryOver,
                                }}
                            />
                            <DeleteEnvelopeButton envelopId={e.envelopId} />
                        </div>
                    </PermissionGate>
                </div>

                <div className="grid gap-1">
                    <div className="flex items-end justify-between text-sm">
                        <MoneyDisplay
                            amount={e.consumed}
                            variant={level === "over" ? "expense" : "neutral"}
                            className="text-lg font-bold"
                        />
                        <span className="text-xs text-muted-foreground">
                            of <MoneyDisplay amount={e.allocated} />
                        </span>
                    </div>
                    <Progress
                        value={periodPct}
                        indicatorClassName={cn(
                            level === "over" && "bg-destructive",
                            level === "danger" && "bg-[color:var(--expense)]",
                            level === "warn" && "bg-[color:var(--warning)]"
                        )}
                        indicatorColor={level === "ok" ? e.color : undefined}
                    />
                    <div className="flex items-center justify-between text-xs">
                        <span
                            className={cn(
                                "text-muted-foreground",
                                level === "over" && "font-semibold text-destructive"
                            )}
                        >
                            {Number.isFinite(rawPct)
                                ? `${rawPct.toFixed(0)}% ${e.cadence === "monthly" ? "this month" : "lifetime"}`
                                : "Spent with no allocation"}
                            {level === "over" && Number.isFinite(rawPct) && " · over"}
                        </span>
                        <span className="text-muted-foreground">
                            Remaining{" "}
                            <MoneyDisplay
                                amount={e.remaining}
                                variant={e.remaining < 0 ? "expense" : "neutral"}
                                className="font-medium"
                            />
                        </span>
                    </div>
                </div>

                {driftingPartitions.length > 0 && (
                    <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                        <AlertTriangle className="size-3" />
                        <span className="font-medium">
                            {driftingPartitions.length} account
                            {driftingPartitions.length === 1 ? "" : "s"} drifted
                        </span>
                    </div>
                )}

                <PermissionGate roles={["owner", "editor"]}>
                    <div className="flex gap-2 pt-1">
                        <EnvelopeAllocateDialog
                            envelopId={e.envelopId}
                            envelopCadence={e.cadence}
                            direction="allocate"
                        />
                        <EnvelopeAllocateDialog
                            envelopId={e.envelopId}
                            envelopCadence={e.cadence}
                            direction="deallocate"
                        />
                    </div>
                </PermissionGate>
            </CardContent>
        </Card>
    );
}

interface EditableEnvelope {
    envelopId: string;
    name: string;
    color: string;
    icon: string;
    description: string | null;
    cadence: Cadence;
    carryOver: boolean;
}

function CreateOrEditEnvelopeDialog({ envelope }: { envelope?: EditableEnvelope }) {
    const { space } = useCurrentSpace();
    const utils = trpc.useUtils();
    const editing = !!envelope;
    const [open, setOpen] = useState(false);
    const [name, setName] = useState(envelope?.name ?? "");
    const [color, setColor] = useState(envelope?.color ?? DEFAULT_COLOR);
    const [icon, setIcon] = useState(envelope?.icon ?? "mail");
    const [description, setDescription] = useState(envelope?.description ?? "");
    const [cadence, setCadence] = useState<Cadence>(envelope?.cadence ?? "none");
    const [carryOver, setCarryOver] = useState<boolean>(envelope?.carryOver ?? false);

    const invalidate = async () => {
        await utils.envelop.listBySpace.invalidate({ spaceId: space.id });
        await utils.analytics.envelopeUtilization.invalidate({ spaceId: space.id });
    };

    const create = trpc.envelop.create.useMutation({
        onSuccess: async () => {
            toast.success("Envelope created");
            await invalidate();
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });
    const update = trpc.envelop.update.useMutation({
        onSuccess: async () => {
            toast.success("Envelope updated");
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
                        New envelope
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {editing ? "Edit envelope" : "Create envelope"}
                    </DialogTitle>
                    <DialogDescription>
                        Envelopes hold allocated amounts for spending categories.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!name.trim()) return;
                        if (editing) {
                            update.mutate({
                                envelopId: envelope!.envelopId,
                                name: name.trim(),
                                color,
                                icon,
                                description: description.trim() || null,
                                cadence,
                                carryOver,
                            });
                        } else {
                            create.mutate({
                                spaceId: space.id,
                                name: name.trim(),
                                color,
                                icon,
                                description: description.trim() || undefined,
                                cadence,
                                carryOver,
                            });
                        }
                    }}
                >
                    <div className="grid gap-1.5">
                        <Label htmlFor="envelope-name">Name</Label>
                        <Input
                            id="envelope-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Groceries, Entertainment…"
                            required
                            maxLength={255}
                            autoFocus
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="envelope-description">Description (optional)</Label>
                        <Textarea
                            id="envelope-description"
                            rows={2}
                            maxLength={2000}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What does this envelope cover?"
                        />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label>Cadence</Label>
                            <Select value={cadence} onValueChange={(v) => setCadence(v as Cadence)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">
                                        Rolling (accumulates)
                                    </SelectItem>
                                    <SelectItem value="monthly">
                                        Monthly (resets on the 1st)
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {cadence !== "none" && (
                            <div className="grid gap-1.5">
                                <Label>Carry-over</Label>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={carryOver}
                                    onClick={() => setCarryOver((s) => !s)}
                                    className={cn(
                                        "flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm transition-colors",
                                        carryOver
                                            ? "bg-primary/10 text-primary"
                                            : "text-muted-foreground"
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "inline-block size-4 rounded-full border border-border",
                                            carryOver && "bg-primary"
                                        )}
                                    />
                                    {carryOver
                                        ? "Unused rolls into next month"
                                        : "Unused disappears"}
                                </button>
                            </div>
                        )}
                    </div>
                    <EntityStyleFields
                        name={name}
                        color={color}
                        setColor={setColor}
                        icon={icon}
                        setIcon={setIcon}
                    />
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="gradient"
                            disabled={!name.trim() || pending}
                        >
                            {pending ? "Saving…" : editing ? "Save" : "Create"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function DeleteEnvelopeButton({ envelopId }: { envelopId: string }) {
    const { space } = useCurrentSpace();
    const utils = trpc.useUtils();
    const del = trpc.envelop.delete.useMutation({
        onSuccess: async () => {
            toast.success("Envelope deleted");
            await utils.envelop.listBySpace.invalidate({ spaceId: space.id });
            await utils.analytics.envelopeUtilization.invalidate({ spaceId: space.id });
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
            title="Delete envelope?"
            description="You cannot delete an envelope that still has categories. Move or delete its categories first."
            confirmLabel="Delete"
            destructive
            onConfirm={() => del.mutate({ envelopId })}
        />
    );
}

