import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Trash2 } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { formatInAppTz } from "@/lib/formatDate";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/shared/PageHeader";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PermissionGate } from "@/components/shared/PermissionGate";
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
import { ROUTES } from "@/router/routes";

export default function PlanDetailPage() {
    const { space } = useCurrentSpace();
    const { planId } = useParams<{ planId: string }>();
    const utils = trpc.useUtils();

    const progressQuery = trpc.analytics.planProgress.useQuery({ spaceId: space.id });
    const allocationsQuery = trpc.plan.allocationListBySpace.useQuery({
        spaceId: space.id,
    });
    const plan = progressQuery.data?.find((p) => p.planId === planId);
    const allocations = (allocationsQuery.data ?? []).filter(
        (a) => a.plan_id === planId
    );

    const deleteAlloc = trpc.plan.allocationDelete.useMutation({
        onSuccess: async () => {
            toast.success("Allocation removed");
            await utils.plan.allocationListBySpace.invalidate({ spaceId: space.id });
            await utils.analytics.planProgress.invalidate({ spaceId: space.id });
            await utils.analytics.spaceSummary.invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    // tRPC serializes Date → ISO string over HTTP; rehydrate before date-fns.
    const targetDate = plan?.targetDate ? new Date(plan.targetDate) : null;
    const daysLeft = targetDate
        ? differenceInCalendarDays(targetDate, new Date())
        : null;

    return (
        <div className="grid gap-5 sm:gap-6">
            <Button asChild variant="ghost" size="sm" className="w-fit">
                <Link to={ROUTES.spacePlans(space.id)}>
                    <ArrowLeft />
                    All plans
                </Link>
            </Button>
            <PageHeader
                title={plan?.name ?? "Plan"}
                description={
                    plan ? (
                        <span className="flex items-center gap-2">
                            <EntityAvatar color={plan.color} icon={plan.icon} size="sm" />
                            {plan.description ?? "Long-term goal progress"}
                        </span>
                    ) : null
                }
            />

            {plan && (
                <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                    <Metric
                        label="Allocated"
                        value={
                            <MoneyDisplay
                                amount={plan.allocated}
                                className="block text-xl font-bold sm:text-2xl"
                            />
                        }
                    />
                    {plan.targetAmount != null && (
                        <Metric
                            label="Target"
                            value={
                                <MoneyDisplay
                                    amount={plan.targetAmount}
                                    className="block text-xl font-bold sm:text-2xl"
                                />
                            }
                        />
                    )}
                    {plan.pctComplete != null && (
                        <Metric
                            label="Progress"
                            value={
                                <span className="block text-xl font-bold sm:text-2xl">
                                    {plan.pctComplete.toFixed(0)}%
                                </span>
                            }
                        />
                    )}
                    {targetDate && (
                        <Metric
                            label="Target date"
                            value={
                                <span className="flex items-center gap-2 text-sm font-semibold sm:text-base">
                                    <CalendarDays className="size-4" />
                                    <span>
                                        {formatInAppTz(targetDate, "MMM d, yyyy")}
                                        <span className="block text-xs font-normal text-muted-foreground">
                                            {daysLeft !== null && daysLeft < 0
                                                ? `${Math.abs(daysLeft)}d overdue`
                                                : `${daysLeft}d left`}
                                        </span>
                                    </span>
                                </span>
                            }
                        />
                    )}
                </div>
            )}

            {plan?.pctComplete != null && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Funding progress</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Progress value={plan.pctComplete} indicatorColor={plan.color} />
                    </CardContent>
                </Card>
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
                                        {formatInAppTz(a.created_at, "MMM d, yyyy HH:mm")}
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
