import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, AlertTriangle, ArrowRightLeft, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/shared/PageHeader";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { EnvelopeAllocateDialog } from "@/features/allocations/EnvelopeAllocateDialog";
import { Donut } from "@/components/shared/charts/Donut";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import { cn } from "@/lib/utils";

export default function EnvelopeDetailPage() {
    const { space } = useCurrentSpace();
    const { envelopeId } = useParams<{ envelopeId: string }>();
    const utils = trpc.useUtils();

    const utilizationQuery = trpc.analytics.envelopeUtilization.useQuery({
        spaceId: space.id,
    });
    const allocationsQuery = trpc.envelop.allocationListBySpace.useQuery({
        spaceId: space.id,
    });
    const accountsQuery = trpc.account.listBySpace.useQuery({ spaceId: space.id });

    const envelope = utilizationQuery.data?.find((e) => e.envelopId === envelopeId);
    const allocations = (allocationsQuery.data ?? []).filter(
        (a) => a.envelop_id === envelopeId
    );

    const accountsById = useMemo(() => {
        const m = new Map<
            string,
            { id: string; name: string; color: string; icon: string }
        >();
        for (const a of accountsQuery.data ?? []) m.set(a.id, a);
        return m;
    }, [accountsQuery.data]);

    const rawPct =
        envelope && envelope.allocated > 0
            ? (envelope.consumed / envelope.allocated) * 100
            : envelope && envelope.consumed > 0
              ? Infinity
              : 0;
    const periodPct = Math.min(100, rawPct);
    const over = rawPct > 100;

    const deleteAlloc = trpc.envelop.allocationDelete.useMutation({
        onSuccess: async () => {
            toast.success("Allocation removed");
            await Promise.all([
                utils.envelop.allocationListBySpace.invalidate({ spaceId: space.id }),
                utils.analytics.envelopeUtilization.invalidate({ spaceId: space.id }),
                utils.analytics.spaceSummary.invalidate(),
                utils.analytics.accountAllocation.invalidate(),
            ]);
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <div className="grid gap-5 sm:gap-6">
            <Button asChild variant="ghost" size="sm" className="w-fit">
                <Link to={ROUTES.spaceEnvelopes(space.id)}>
                    <ArrowLeft />
                    All envelopes
                </Link>
            </Button>
            <PageHeader
                title={envelope?.name ?? "Envelope"}
                description={
                    envelope ? (
                        <span className="flex flex-wrap items-center gap-2">
                            <EntityAvatar color={envelope.color} icon={envelope.icon} size="sm" />
                            <span className="rounded-sm bg-secondary px-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                {envelope.cadence === "monthly" ? "Monthly" : "Rolling"}
                            </span>
                            {envelope.carryOver && (
                                <span className="rounded-sm bg-secondary px-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                    Carry-over
                                </span>
                            )}
                            <span className="text-muted-foreground">
                                {envelope.description ?? "Allocation history and utilization"}
                            </span>
                        </span>
                    ) : (
                        "Allocation history and utilization"
                    )
                }
            />

            {envelope && (
                <>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Metric
                            label={envelope.cadence === "monthly" ? "Allocated this month" : "Allocated"}
                            value={
                                <MoneyDisplay
                                    amount={envelope.allocated}
                                    className="block text-xl font-bold sm:text-2xl"
                                />
                            }
                        />
                        <Metric
                            label={envelope.cadence === "monthly" ? "Spent this month" : "Spent"}
                            value={
                                <MoneyDisplay
                                    amount={envelope.consumed}
                                    variant="expense"
                                    className="block text-xl font-bold sm:text-2xl"
                                />
                            }
                        />
                        <Metric
                            label="Remaining"
                            value={
                                <MoneyDisplay
                                    amount={envelope.remaining}
                                    variant={envelope.remaining < 0 ? "expense" : "neutral"}
                                    className="block text-xl font-bold sm:text-2xl"
                                />
                            }
                        />
                        <Metric
                            label="Drift"
                            value={
                                <span
                                    className={cn(
                                        "block text-xl font-bold sm:text-2xl",
                                        envelope.breakdown.some((b) => b.isDrift) &&
                                            "text-destructive"
                                    )}
                                >
                                    {envelope.breakdown.filter((b) => b.isDrift).length}{" "}
                                    <span className="text-sm font-normal text-muted-foreground">
                                        account
                                        {envelope.breakdown.filter((b) => b.isDrift).length === 1
                                            ? ""
                                            : "s"}
                                    </span>
                                </span>
                            }
                        />
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Utilization</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Progress
                                value={periodPct}
                                indicatorColor={over ? "var(--destructive)" : envelope.color}
                            />
                            <p className="mt-2 text-xs text-muted-foreground">
                                {Number.isFinite(rawPct)
                                    ? `${rawPct.toFixed(0)}% used`
                                    : "Spent with no allocation"}
                                {over && Number.isFinite(rawPct) && " · over"}
                            </p>
                        </CardContent>
                    </Card>

                    <EnvelopeAllocationMap
                        envelope={envelope}
                        accountsById={accountsById}
                    />

                    <Card className="p-0">
                        <CardHeader className="flex-row items-center justify-between">
                            <CardTitle className="text-base">
                                Breakdown by account
                            </CardTitle>
                            <PermissionGate roles={["owner", "editor"]}>
                                <EnvelopeAllocateDialog
                                    envelopId={envelope.envelopId}
                                    envelopCadence={envelope.cadence}
                                    direction="allocate"
                                    trigger={
                                        <Button size="sm" variant="outline">
                                            Allocate
                                        </Button>
                                    }
                                />
                            </PermissionGate>
                        </CardHeader>
                        {envelope.breakdown.length === 0 ? (
                            <CardContent>
                                <p className="text-sm text-muted-foreground">
                                    No account-scoped activity yet. Allocate or spend to see the
                                    partition here.
                                </p>
                            </CardContent>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Account</TableHead>
                                        <TableHead className="text-right">Allocated</TableHead>
                                        <TableHead className="text-right">Spent</TableHead>
                                        <TableHead className="text-right">Remaining</TableHead>
                                        <PermissionGate roles={["owner", "editor"]}>
                                            <TableHead className="w-24" />
                                        </PermissionGate>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {envelope.breakdown.map((b) => {
                                        const account = b.accountId
                                            ? accountsById.get(b.accountId)
                                            : null;
                                        const label = account ? account.name : "Unassigned pool";
                                        return (
                                            <TableRow key={b.accountId ?? "unassigned"}>
                                                <TableCell>
                                                    <span className="flex items-center gap-2">
                                                        {account ? (
                                                            <EntityAvatar
                                                                size="sm"
                                                                color={account.color}
                                                                icon={account.icon}
                                                            />
                                                        ) : (
                                                            <span className="inline-flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                                                ·
                                                            </span>
                                                        )}
                                                        <span className="text-sm font-medium">
                                                            {label}
                                                        </span>
                                                        {b.isDrift && (
                                                            <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                                                                <AlertTriangle className="size-3" />
                                                                Drift
                                                            </span>
                                                        )}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <MoneyDisplay amount={b.allocated} />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <MoneyDisplay
                                                        amount={b.consumed}
                                                        variant="expense"
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <MoneyDisplay
                                                        amount={b.remaining}
                                                        variant={
                                                            b.remaining < 0 ? "expense" : "neutral"
                                                        }
                                                    />
                                                </TableCell>
                                                <PermissionGate roles={["owner", "editor"]}>
                                                    <TableCell>
                                                        {b.isDrift && (
                                                            <RebalanceDialog
                                                                envelopeId={envelope.envelopId}
                                                                envelopCadence={envelope.cadence}
                                                                targetAccountId={
                                                                    b.accountId ?? null
                                                                }
                                                                breakdown={envelope.breakdown}
                                                                accountsById={accountsById}
                                                                neededAmount={Math.abs(b.remaining)}
                                                            />
                                                        )}
                                                    </TableCell>
                                                </PermissionGate>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        )}
                    </Card>
                </>
            )}

            <Card className="p-0">
                <CardHeader>
                    <CardTitle className="text-base">Allocation history</CardTitle>
                </CardHeader>
                {allocations.length === 0 ? (
                    <CardContent>
                        <p className="text-sm text-muted-foreground">No allocations yet.</p>
                    </CardContent>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Account</TableHead>
                                <TableHead>Period</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <PermissionGate roles={["owner"]}>
                                    <TableHead className="w-12" />
                                </PermissionGate>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allocations.map((a) => {
                                const account = a.account_id
                                    ? accountsById.get(a.account_id)
                                    : null;
                                return (
                                    <TableRow key={a.id}>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {format(
                                                new Date(a.created_at),
                                                "MMM d, yyyy HH:mm"
                                            )}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {account ? (
                                                <span className="inline-flex items-center gap-1.5">
                                                    <EntityAvatar
                                                        size="sm"
                                                        color={account.color}
                                                        icon={account.icon}
                                                    />
                                                    {account.name}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">
                                                    Unassigned
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {a.period_start
                                                ? format(new Date(a.period_start), "MMM yyyy")
                                                : envelope?.cadence === "monthly"
                                                  ? format(
                                                        new Date(a.created_at),
                                                        "MMM yyyy"
                                                    )
                                                  : "—"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <MoneyDisplay
                                                amount={a.amount}
                                                variant={
                                                    Number(a.amount) < 0 ? "expense" : "income"
                                                }
                                                signed
                                            />
                                        </TableCell>
                                        <PermissionGate roles={["owner"]}>
                                            <TableCell>
                                                <ConfirmDialog
                                                    trigger={
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="size-7"
                                                        >
                                                            <Trash2 className="size-3.5 text-destructive" />
                                                        </Button>
                                                    }
                                                    title="Delete allocation?"
                                                    description="Balances will be recomputed."
                                                    destructive
                                                    confirmLabel="Delete"
                                                    onConfirm={() =>
                                                        deleteAlloc.mutate({
                                                            allocationId: a.id,
                                                        })
                                                    }
                                                />
                                            </TableCell>
                                        </PermissionGate>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </Card>
        </div>
    );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <Card>
            <CardContent className="p-4 sm:p-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
                    {label}
                </p>
                <div className="mt-1.5">{value}</div>
            </CardContent>
        </Card>
    );
}

/**
 * Drift rebalance: transfer allocation *from* another same-envelope
 * partition *to* the drifting partition. Pulls from "available" partitions —
 * ones whose remaining is positive.
 */
function RebalanceDialog({
    envelopeId,
    envelopCadence,
    targetAccountId,
    breakdown,
    accountsById,
    neededAmount,
}: {
    envelopeId: string;
    envelopCadence: "none" | "monthly";
    targetAccountId: string | null;
    breakdown: Array<{
        accountId: string | null;
        allocated: number;
        consumed: number;
        remaining: number;
        isDrift: boolean;
    }>;
    accountsById: Map<string, { id: string; name: string; color: string; icon: string }>;
    neededAmount: number;
}) {
    const { space } = useCurrentSpace();
    const [open, setOpen] = useState(false);
    const availableSources = breakdown.filter(
        (b) => b.remaining > 0 && (b.accountId ?? "unassigned") !== (targetAccountId ?? "unassigned")
    );
    const [sourceKey, setSourceKey] = useState<string>(
        availableSources[0]?.accountId ?? "unassigned"
    );
    const [amount, setAmount] = useState(neededAmount.toFixed(2));
    const utils = trpc.useUtils();

    const mutation = trpc.allocation.transfer.useMutation({
        onSuccess: async () => {
            toast.success("Rebalanced");
            await Promise.all([
                utils.analytics.envelopeUtilization.invalidate({ spaceId: space.id }),
                utils.envelop.allocationListBySpace.invalidate({ spaceId: space.id }),
                utils.analytics.spaceSummary.invalidate(),
                utils.analytics.accountAllocation.invalidate(),
            ]);
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });

    const sourceAccountId = sourceKey === "unassigned" ? null : sourceKey;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                    <ArrowRightLeft className="size-3.5" />
                    Rebalance
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Rebalance drift</DialogTitle>
                    <DialogDescription>
                        Move allocation from another account partition in this envelope to clear
                        the drift.
                    </DialogDescription>
                </DialogHeader>
                {availableSources.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No other account partitions have positive remaining. Allocate more from
                        unallocated cash instead.
                    </p>
                ) : (
                    <form
                        className="grid gap-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            const n = Number(amount);
                            if (!(n > 0)) {
                                toast.error("Enter a positive amount");
                                return;
                            }
                            mutation.mutate({
                                amount: n,
                                from: {
                                    kind: "envelop",
                                    envelopId: envelopeId,
                                    accountId: sourceAccountId,
                                },
                                to: {
                                    kind: "envelop",
                                    envelopId: envelopeId,
                                    accountId: targetAccountId,
                                },
                            });
                        }}
                    >
                        <div className="grid gap-1.5">
                            <Label>From partition</Label>
                            <Select value={sourceKey} onValueChange={setSourceKey}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableSources.map((s) => {
                                        const account = s.accountId
                                            ? accountsById.get(s.accountId)
                                            : null;
                                        const key = s.accountId ?? "unassigned";
                                        return (
                                            <SelectItem key={key} value={key}>
                                                {account?.name ?? "Unassigned pool"} —{" "}
                                                {s.remaining.toFixed(2)} available
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="rebal-amount">Amount</Label>
                            <Input
                                id="rebal-amount"
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                required
                            />
                        </div>
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
                                disabled={mutation.isPending}
                            >
                                {mutation.isPending ? "Transferring…" : "Rebalance"}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}

/**
 * Donut visualizing how this envelope's allocation is distributed across
 * accounts. Each slice is one (envelope, account) partition; drifting
 * partitions (consumed > allocated) are surfaced in the subtitle because a
 * donut can't naturally show negative slices.
 */
function EnvelopeAllocationMap({
    envelope,
    accountsById,
}: {
    envelope: {
        color: string;
        breakdown: Array<{
            accountId: string | null;
            allocated: number;
            consumed: number;
            remaining: number;
            isDrift: boolean;
        }>;
    };
    accountsById: Map<string, { id: string; name: string; color: string; icon: string }>;
}) {
    const data = envelope.breakdown
        .filter((b) => b.allocated > 0)
        .map((b) => {
            const account = b.accountId ? accountsById.get(b.accountId) : null;
            return {
                id: b.accountId ?? "unassigned",
                name: account?.name ?? "Unassigned pool",
                value: b.allocated,
                color: account?.color ?? "#64748b",
                hint: b.isDrift
                    ? `Drift: spent ${b.consumed.toFixed(2)} against ${b.allocated.toFixed(2)} allocated`
                    : `Spent ${b.consumed.toFixed(2)} · remaining ${b.remaining.toFixed(2)}`,
            };
        });

    const driftOnly = envelope.breakdown.filter((b) => b.isDrift && b.allocated <= 0);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Allocation map</CardTitle>
            </CardHeader>
            <CardContent>
                <Donut
                    data={data}
                    centerLabel="Allocated"
                    height={260}
                    emptyLabel="No allocations attached to accounts yet."
                />
                {driftOnly.length > 0 && (
                    <p className="mt-3 text-xs text-destructive">
                        {driftOnly.length} account{driftOnly.length === 1 ? "" : "s"} drifted
                        with spending but no allocation — shown in the breakdown below.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
