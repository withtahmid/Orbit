import { useState } from "react";
import { Link } from "react-router-dom";
import {
    Target,
    Plus,
    Trash2,
    Pencil,
    CalendarDays,
} from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { formatInAppTz } from "@/lib/formatDate";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { EntityStyleFields } from "@/components/shared/EntityStyleFields";
import { PlanAllocateDialog } from "@/features/allocations/PlanAllocateDialog";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import { DEFAULT_COLOR } from "@/lib/entityStyle";
import { toInputDate } from "@/lib/dates";

export default function PlansPage() {
    const { space } = useCurrentSpace();
    const plansQuery = trpc.analytics.planProgress.useQuery({ spaceId: space.id });

    return (
        <div className="grid gap-5 sm:gap-6">
            <PageHeader
                title="Plans"
                description="Long-term goals and savings targets"
                actions={
                    <PermissionGate roles={["owner"]}>
                        <CreateOrEditPlanDialog />
                    </PermissionGate>
                }
            />

            {plansQuery.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-44 rounded-xl" />
                    ))}
                </div>
            ) : !plansQuery.data || plansQuery.data.length === 0 ? (
                <EmptyState
                    icon={Target}
                    title="No plans yet"
                    description="Create a plan to set aside money for long-term goals."
                    action={
                        <PermissionGate roles={["owner"]}>
                            <CreateOrEditPlanDialog />
                        </PermissionGate>
                    }
                />
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {plansQuery.data.map((p) => {
                        // tRPC serializes Date over HTTP as an ISO string, so
                        // rehydrate before passing to date-fns.
                        const targetDate = p.targetDate ? new Date(p.targetDate) : null;
                        const daysLeft = targetDate
                            ? differenceInCalendarDays(targetDate, new Date())
                            : null;
                        const hasTarget = p.targetAmount && p.targetAmount > 0;
                        return (
                            <Card
                                key={p.planId}
                                className="transition-colors hover:border-foreground/20"
                                style={{ borderTop: `3px solid ${p.color}` }}
                            >
                                <CardContent className="grid gap-3 p-4 sm:p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <Link
                                            to={ROUTES.spacePlanDetail(space.id, p.planId)}
                                            className="flex min-w-0 flex-1 items-center gap-3 rounded-md -mx-1 px-1 py-1 hover:bg-accent/30"
                                        >
                                            <EntityAvatar
                                                color={p.color}
                                                icon={p.icon}
                                                size="md"
                                            />
                                            <div className="min-w-0">
                                                <p className="truncate font-semibold">
                                                    {p.name}
                                                </p>
                                                {p.description && (
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {p.description}
                                                    </p>
                                                )}
                                            </div>
                                        </Link>
                                        <PermissionGate roles={["owner"]}>
                                            <div className="flex">
                                                <CreateOrEditPlanDialog plan={p} />
                                                <DeletePlanButton planId={p.planId} />
                                            </div>
                                        </PermissionGate>
                                    </div>

                                    <div className="grid gap-1.5">
                                        <div className="flex items-end justify-between text-sm">
                                            <MoneyDisplay
                                                amount={p.allocated}
                                                className="text-lg font-bold"
                                            />
                                            {hasTarget && (
                                                <span className="text-xs text-muted-foreground">
                                                    of{" "}
                                                    <MoneyDisplay
                                                        amount={p.targetAmount ?? 0}
                                                    />
                                                </span>
                                            )}
                                        </div>
                                        {hasTarget && (
                                            <Progress
                                                value={p.pctComplete ?? 0}
                                                indicatorColor={p.color}
                                            />
                                        )}
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                            {hasTarget && (
                                                <span>
                                                    {(p.pctComplete ?? 0).toFixed(0)}% funded
                                                </span>
                                            )}
                                            {targetDate && (
                                                <span className="flex items-center gap-1">
                                                    <CalendarDays className="size-3" />
                                                    {daysLeft !== null && daysLeft < 0
                                                        ? `${Math.abs(daysLeft)}d overdue`
                                                        : `${daysLeft}d left`}{" "}
                                                    ·{" "}
                                                    {formatInAppTz(targetDate, "MMM d, yyyy")}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <PermissionGate roles={["owner", "editor"]}>
                                        <div className="flex gap-2">
                                            <PlanAllocateDialog
                                                planId={p.planId}
                                                direction="allocate"
                                            />
                                            <PlanAllocateDialog
                                                planId={p.planId}
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

function CreateOrEditPlanDialog({
    plan,
}: {
    plan?: {
        planId: string;
        name: string;
        color: string;
        icon: string;
        description: string | null;
        targetAmount: number | null;
        targetDate: Date | null;
    };
}) {
    const { space } = useCurrentSpace();
    const utils = trpc.useUtils();
    const editing = !!plan;
    const [open, setOpen] = useState(false);
    const [name, setName] = useState(plan?.name ?? "");
    const [color, setColor] = useState(plan?.color ?? DEFAULT_COLOR);
    const [icon, setIcon] = useState(plan?.icon ?? "target");
    const [description, setDescription] = useState(plan?.description ?? "");
    const [targetAmount, setTargetAmount] = useState(
        plan?.targetAmount != null ? String(plan.targetAmount) : ""
    );
    const [targetDate, setTargetDate] = useState(
        toInputDate(plan?.targetDate ? new Date(plan.targetDate) : null)
    );

    const invalidate = async () => {
        await utils.plan.listBySpace.invalidate({ spaceId: space.id });
        await utils.analytics.planProgress.invalidate({ spaceId: space.id });
    };

    const create = trpc.plan.create.useMutation({
        onSuccess: async () => {
            toast.success("Plan created");
            await invalidate();
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });

    const update = trpc.plan.update.useMutation({
        onSuccess: async () => {
            toast.success("Plan updated");
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
                        New plan
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{editing ? "Edit plan" : "Create plan"}</DialogTitle>
                    <DialogDescription>
                        Plans hold money for long-term goals. Spend through envelopes, not plans.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!name.trim()) return;
                        const target = targetAmount ? Number(targetAmount) : null;
                        const date = targetDate ? new Date(targetDate) : null;
                        if (editing) {
                            update.mutate({
                                planId: plan!.planId,
                                name: name.trim(),
                                color,
                                icon,
                                description: description.trim() || null,
                                targetAmount: target,
                                targetDate: date,
                            });
                        } else {
                            create.mutate({
                                spaceId: space.id,
                                name: name.trim(),
                                color,
                                icon,
                                description: description.trim() || undefined,
                                targetAmount: target ?? undefined,
                                targetDate: date ?? undefined,
                            });
                        }
                    }}
                >
                    <div className="grid gap-1.5">
                        <Label htmlFor="plan-name">Name</Label>
                        <Input
                            id="plan-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="House down payment, Vacation…"
                            required
                            maxLength={255}
                            autoFocus
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="plan-desc">Description (optional)</Label>
                        <Textarea
                            id="plan-desc"
                            rows={2}
                            maxLength={2000}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Context for this plan"
                        />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="plan-target">Target amount (optional)</Label>
                            <Input
                                id="plan-target"
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={targetAmount}
                                onChange={(e) => setTargetAmount(e.target.value)}
                                placeholder="0.00"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="plan-date">Target date (optional)</Label>
                            <Input
                                id="plan-date"
                                type="date"
                                value={targetDate}
                                onChange={(e) => setTargetDate(e.target.value)}
                            />
                        </div>
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

function DeletePlanButton({ planId }: { planId: string }) {
    const { space } = useCurrentSpace();
    const utils = trpc.useUtils();
    const del = trpc.plan.delete.useMutation({
        onSuccess: async () => {
            toast.success("Plan deleted");
            await utils.plan.listBySpace.invalidate({ spaceId: space.id });
            await utils.analytics.planProgress.invalidate({ spaceId: space.id });
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
            title="Delete plan?"
            description="All allocations to this plan will be removed."
            confirmLabel="Delete"
            destructive
            onConfirm={() => del.mutate({ planId })}
        />
    );
}
