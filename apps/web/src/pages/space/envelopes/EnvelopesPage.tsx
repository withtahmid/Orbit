import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Plus, Trash2, ArrowUp, ArrowDown, Pencil, Circle } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { EntityStyleFields } from "@/components/shared/EntityStyleFields";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";
import { ROUTES } from "@/router/routes";
import { DEFAULT_COLOR } from "@/lib/entityStyle";
import { cn } from "@/lib/utils";

export default function EnvelopesPage() {
    const { space } = useCurrentSpace();
    const { period } = usePeriod("this-month");

    const utilizationQuery = trpc.analytics.envelopeUtilization.useQuery({
        spaceId: space.id,
        periodStart: period.start,
        periodEnd: period.end,
    });

    return (
        <div className="grid gap-5 sm:gap-6">
            <PageHeader
                title="Envelopes"
                description="Budget buckets that track where your money is allocated"
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <PeriodSelector />
                        <PermissionGate roles={["owner"]}>
                            <CreateOrEditEnvelopeDialog />
                        </PermissionGate>
                    </div>
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
                    {utilizationQuery.data.map((e) => {
                        const rawPct =
                            e.allocated > 0
                                ? (e.periodConsumed / e.allocated) * 100
                                : e.periodConsumed > 0
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
                        return (
                            <Card
                                key={e.envelopId}
                                className="overflow-hidden transition-colors hover:border-foreground/20"
                                style={{
                                    borderTop: `3px solid ${e.color}`,
                                }}
                            >
                                <CardContent className="grid gap-3 p-4 sm:p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <Link
                                            to={ROUTES.spaceEnvelopeDetail(
                                                space.id,
                                                e.envelopId
                                            )}
                                            className="flex min-w-0 flex-1 items-center gap-3 rounded-md hover:bg-accent/30 -mx-1 px-1 py-1"
                                        >
                                            <EntityAvatar
                                                color={e.color}
                                                icon={e.icon}
                                                size="md"
                                            />
                                            <div className="min-w-0">
                                                <p className="truncate font-semibold">
                                                    {e.name}
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
                                                <CreateOrEditEnvelopeDialog envelope={e} />
                                                <DeleteEnvelopeButton envelopId={e.envelopId} />
                                            </div>
                                        </PermissionGate>
                                    </div>

                                    <div className="grid gap-1">
                                        <div className="flex items-end justify-between text-sm">
                                            <MoneyDisplay
                                                amount={e.periodConsumed}
                                                variant={
                                                    level === "over" ? "expense" : "neutral"
                                                }
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
                                            indicatorColor={
                                                level === "ok" ? e.color : undefined
                                            }
                                        />
                                        <div className="flex items-center justify-between text-xs">
                                            <span
                                                className={cn(
                                                    "text-muted-foreground",
                                                    level === "over" &&
                                                        "font-semibold text-destructive"
                                                )}
                                            >
                                                {Number.isFinite(rawPct)
                                                    ? `${rawPct.toFixed(0)}% this period`
                                                    : "Spent with no allocation"}
                                                {level === "over" &&
                                                    Number.isFinite(rawPct) &&
                                                    " · over budget"}
                                            </span>
                                            <span className="flex items-center gap-1 text-muted-foreground">
                                                <Circle
                                                    className="size-2 fill-current"
                                                    style={{ color: e.color }}
                                                />
                                                <MoneyDisplay
                                                    amount={e.remaining}
                                                    variant={
                                                        e.remaining < 0
                                                            ? "expense"
                                                            : "neutral"
                                                    }
                                                    className="font-medium"
                                                />
                                                <span>lifetime</span>
                                            </span>
                                        </div>
                                    </div>

                                    <PermissionGate roles={["owner", "editor"]}>
                                        <div className="flex gap-2 pt-1">
                                            <AllocateDialog
                                                envelopId={e.envelopId}
                                                direction="allocate"
                                            />
                                            <AllocateDialog
                                                envelopId={e.envelopId}
                                                direction="deallocate"
                                            />
                                        </div>
                                    </PermissionGate>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function CreateOrEditEnvelopeDialog({
    envelope,
}: {
    envelope?: {
        envelopId: string;
        name: string;
        color: string;
        icon: string;
        description: string | null;
    };
}) {
    const { space } = useCurrentSpace();
    const utils = trpc.useUtils();
    const editing = !!envelope;
    const [open, setOpen] = useState(false);
    const [name, setName] = useState(envelope?.name ?? "");
    const [color, setColor] = useState(envelope?.color ?? DEFAULT_COLOR);
    const [icon, setIcon] = useState(envelope?.icon ?? "mail");
    const [description, setDescription] = useState(envelope?.description ?? "");

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
                            });
                        } else {
                            create.mutate({
                                spaceId: space.id,
                                name: name.trim(),
                                color,
                                icon,
                                description: description.trim() || undefined,
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

function AllocateDialog({
    envelopId,
    direction,
}: {
    envelopId: string;
    direction: "allocate" | "deallocate";
}) {
    const { space } = useCurrentSpace();
    const [open, setOpen] = useState(false);
    const [amount, setAmount] = useState("");
    const utils = trpc.useUtils();
    const allocate = trpc.envelop.allocationCreate.useMutation({
        onSuccess: async () => {
            toast.success(direction === "allocate" ? "Allocated" : "Deallocated");
            await utils.envelop.allocationListBySpace.invalidate({ spaceId: space.id });
            await utils.analytics.envelopeUtilization.invalidate({ spaceId: space.id });
            await utils.analytics.spaceSummary.invalidate();
            setAmount("");
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1">
                    {direction === "allocate" ? (
                        <>
                            <ArrowUp className="size-3.5" />
                            Allocate
                        </>
                    ) : (
                        <>
                            <ArrowDown className="size-3.5" />
                            Deallocate
                        </>
                    )}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {direction === "allocate" ? "Allocate" : "Deallocate"} amount
                    </DialogTitle>
                    <DialogDescription>
                        {direction === "allocate"
                            ? "Move unallocated cash into this envelope."
                            : "Pull money back out of this envelope."}
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="grid gap-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        const n = Number(amount);
                        if (!(n > 0)) {
                            toast.error("Enter a positive amount");
                            return;
                        }
                        allocate.mutate({
                            envelopId,
                            amount: direction === "allocate" ? n : -n,
                        });
                    }}
                >
                    <Label htmlFor="alloc-amount">Amount</Label>
                    <Input
                        id="alloc-amount"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        autoFocus
                        required
                    />
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="gradient" disabled={allocate.isPending}>
                            {allocate.isPending ? "Saving…" : "Confirm"}
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
