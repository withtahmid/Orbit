import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/shared/PageHeader";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { PeriodSelector } from "@/components/shared/PeriodSelector";
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
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { usePeriod } from "@/hooks/usePeriod";
import { ROUTES } from "@/router/routes";

export default function EnvelopeDetailPage() {
    const { space } = useCurrentSpace();
    const { envelopeId } = useParams<{ envelopeId: string }>();
    const { period } = usePeriod("this-month");
    const utils = trpc.useUtils();

    const utilizationQuery = trpc.analytics.envelopeUtilization.useQuery({
        spaceId: space.id,
        periodStart: period.start,
        periodEnd: period.end,
    });
    const allocationsQuery = trpc.envelop.allocationListBySpace.useQuery({
        spaceId: space.id,
    });
    const envelope = utilizationQuery.data?.find((e) => e.envelopId === envelopeId);
    const allocations = (allocationsQuery.data ?? []).filter(
        (a) => a.envelop_id === envelopeId
    );

    const periodPct =
        envelope && envelope.allocated > 0
            ? Math.min(100, (envelope.periodConsumed / envelope.allocated) * 100)
            : 0;

    const deleteAlloc = trpc.envelop.allocationDelete.useMutation({
        onSuccess: async () => {
            toast.success("Allocation removed");
            await utils.envelop.allocationListBySpace.invalidate({ spaceId: space.id });
            await utils.analytics.envelopeUtilization.invalidate({ spaceId: space.id });
            await utils.analytics.spaceSummary.invalidate();
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
                        <span className="flex items-center gap-2">
                            <EntityAvatar
                                color={envelope.color}
                                icon={envelope.icon}
                                size="sm"
                            />
                            {envelope.description ?? "Allocation history and utilization"}
                        </span>
                    ) : (
                        "Allocation history and utilization"
                    )
                }
                actions={<PeriodSelector />}
            />

            {envelope && (
                <>
                    <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                        <Metric
                            label="Allocated"
                            value={
                                <MoneyDisplay
                                    amount={envelope.allocated}
                                    className="block text-xl font-bold sm:text-2xl"
                                />
                            }
                        />
                        <Metric
                            label="Period consumed"
                            value={
                                <MoneyDisplay
                                    amount={envelope.periodConsumed}
                                    variant="expense"
                                    className="block text-xl font-bold sm:text-2xl"
                                />
                            }
                        />
                        <Metric
                            label="Lifetime consumed"
                            value={
                                <MoneyDisplay
                                    amount={envelope.consumed}
                                    variant="muted"
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
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Utilization this period</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Progress value={periodPct} indicatorColor={envelope.color} />
                            <p className="mt-2 text-xs text-muted-foreground">
                                {periodPct.toFixed(0)}% used
                            </p>
                        </CardContent>
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
                                <TableHead className="text-right">Amount</TableHead>
                                <PermissionGate roles={["owner"]}>
                                    <TableHead className="w-12" />
                                </PermissionGate>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allocations.map((a) => (
                                <TableRow key={a.id}>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {format(new Date(a.created_at), "MMM d, yyyy HH:mm")}
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
                            ))}
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
