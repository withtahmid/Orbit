import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { trpc, type RouterOutput } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { useIdempotencyKey } from "@/hooks/useIdempotencyKey";
import { ROUTES } from "@/router/routes";
import { formatInAppTz } from "@/lib/formatDate";
import { toInputDate } from "@/lib/dates";

export default function DpsDetailPage() {
    const { space, isPersonal } = useCurrentSpace();
    const { schemeId } = useParams<{ schemeId: string }>();

    const detailQuery = trpc.dps.getById.useQuery(
        { schemeId: schemeId! },
        { enabled: !!schemeId }
    );
    const projectionQuery = trpc.dps.projection.useQuery(
        { schemeId: schemeId! },
        { enabled: !!schemeId }
    );
    const accountsQuery = trpc.account.listBySpace.useQuery(
        { spaceId: space.id },
        { enabled: !isPersonal }
    );

    const [matureOpen, setMatureOpen] = useState(false);
    const [encashOpen, setEncashOpen] = useState(false);

    if (detailQuery.isLoading || !detailQuery.data) {
        return (
            <div className="grid gap-4">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-64 rounded-xl" />
            </div>
        );
    }

    const dps = detailQuery.data;
    const ratePct = dps.annualRateBps / 100;

    return (
        <div className="grid gap-5">
            <div>
                <Link
                    to={isPersonal ? ROUTES.spaceDps("me") : ROUTES.spaceDps(space.id)}
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back to DPS
                </Link>
            </div>

            <PageHeader
                title={dps.schemeName || `${dps.bankName} DPS`}
                description={`${dps.bankName} · ${dps.termMonths} months · ${ratePct.toFixed(2)}% · ${dps.compounding}`}
                actions={
                    !isPersonal && dps.status === "active" ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setMatureOpen(true)}>
                                    Mark matured
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setEncashOpen(true)}>
                                    Encash early
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null
                }
            />

            <Card>
                <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
                    <Stat
                        label="Current principal"
                        value={<MoneyDisplay amount={dps.currentPrincipal} />}
                    />
                    <Stat
                        label="Interest so far (est)"
                        value={
                            <MoneyDisplay
                                amount={dps.projectedInterestSoFar}
                                variant="income"
                            />
                        }
                    />
                    <Stat
                        label="Projected maturity (net of WHT)"
                        value={<MoneyDisplay amount={dps.projectedMaturityNet} />}
                        sub={
                            <span className="text-xs text-muted-foreground">
                                gross{" "}
                                <MoneyDisplay
                                    amount={dps.projectedMaturityGross}
                                    className="text-xs"
                                />{" "}
                                · matures{" "}
                                {formatInAppTz(dps.maturityDate, "d MMM yyyy")}
                            </span>
                        }
                    />
                </CardContent>
            </Card>

            <Card>
                <CardContent className="grid gap-3 p-4">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">Progress</div>
                        <Badge variant={dps.status === "active" ? "default" : "secondary"}>
                            {dps.status}
                        </Badge>
                    </div>
                    <div>
                        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                            <span>Time elapsed</span>
                            <span>
                                {dps.monthsElapsed}/{dps.termMonths} months ·{" "}
                                {Math.round(dps.progressPct)}%
                            </span>
                        </div>
                        <Progress value={dps.progressPct} className="h-2" />
                    </div>
                    <div>
                        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                            <span>Installments paid</span>
                            <span>
                                {dps.installmentsPaid}/{dps.termMonths}
                                {dps.missedCount > 0 ? ` (${dps.missedCount} missed)` : ""}
                            </span>
                        </div>
                        <Progress
                            value={Math.min(
                                100,
                                (dps.installmentsPaid / dps.termMonths) * 100
                            )}
                            className="h-2"
                        />
                    </div>
                    {dps.nextInstallmentDate && dps.status === "active" && (
                        <div className="text-xs text-muted-foreground">
                            Next installment due{" "}
                            {formatInAppTz(dps.nextInstallmentDate, "d MMM yyyy")}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="grid gap-3 p-4">
                    <div className="text-sm font-medium">Projection</div>
                    {projectionQuery.data && (
                        <ProjectionChart points={projectionQuery.data} />
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="grid gap-3 p-4">
                    <div className="text-sm font-medium">Installment schedule</div>
                    <ScheduleTable
                        rows={dps.schedule}
                        schemeId={dps.schemeId}
                        sourceAccountOptions={
                            (accountsQuery.data ?? [])
                                .filter((a) => a.account_type !== "locked")
                                .map((a) => ({ id: a.id, name: a.name }))
                        }
                        defaultSourceAccountId={dps.sourceAccountId}
                        disabled={isPersonal || dps.status !== "active"}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardContent className="grid gap-2 p-4 text-sm">
                    <div className="font-medium">Contract</div>
                    <KV k="Bank" v={dps.bankName} />
                    {dps.accountNumber && (
                        <KV k="Account number" v={dps.accountNumber} />
                    )}
                    <KV k="Installment" v={`BDT ${dps.installmentAmount.toLocaleString()} / month`} />
                    <KV k="Rate" v={`${ratePct.toFixed(2)}% / yr (${dps.compounding})`} />
                    <KV k="Withholding tax" v={`${(dps.withholdingTaxBps / 100).toFixed(1)}% of interest`} />
                    <KV k="Start date" v={formatInAppTz(dps.startDate, "d MMM yyyy")} />
                    <KV k="Installment day" v={String(dps.installmentDay)} />
                    {dps.notes && <KV k="Notes" v={dps.notes} />}
                </CardContent>
            </Card>

            {!isPersonal && dps.status === "active" && (
                <>
                    <CloseDpsDialog
                        kind="matured"
                        open={matureOpen}
                        onOpenChange={setMatureOpen}
                        schemeId={dps.schemeId}
                        defaultPayout={dps.projectedMaturityNet}
                        sourceAccountOptions={
                            (accountsQuery.data ?? [])
                                .filter((a) => a.account_type !== "locked")
                                .map((a) => ({ id: a.id, name: a.name }))
                        }
                    />
                    <CloseDpsDialog
                        kind="encashed_early"
                        open={encashOpen}
                        onOpenChange={setEncashOpen}
                        schemeId={dps.schemeId}
                        defaultPayout={dps.currentPrincipal}
                        sourceAccountOptions={
                            (accountsQuery.data ?? [])
                                .filter((a) => a.account_type !== "locked")
                                .map((a) => ({ id: a.id, name: a.name }))
                        }
                    />
                </>
            )}
        </div>
    );
}

function Stat({
    label,
    value,
    sub,
}: {
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
}) {
    return (
        <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {label}
            </div>
            <div className="mt-1 text-lg font-medium">{value}</div>
            {sub && <div className="mt-0.5">{sub}</div>}
        </div>
    );
}

function KV({ k, v }: { k: string; v: string }) {
    return (
        <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{k}</span>
            <span>{v}</span>
        </div>
    );
}

function ProjectionChart({
    points,
}: {
    points: {
        monthIndex: number;
        date: string;
        principalCumulative: number;
        interestCumulative: number;
        balanceCumulative: number;
    }[];
}) {
    const width = 720;
    const height = 220;
    const pad = { l: 56, r: 12, t: 12, b: 28 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;

    const maxBalance = useMemo(
        () => Math.max(1, ...points.map((p) => p.balanceCumulative)),
        [points]
    );
    const xFor = (i: number) => pad.l + (i / (points.length - 1)) * innerW;
    const yFor = (v: number) => pad.t + innerH - (v / maxBalance) * innerH;

    const pathBalance = points
        .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i)} ${yFor(p.balanceCumulative)}`)
        .join(" ");
    const pathPrincipal = points
        .map(
            (p, i) =>
                `${i === 0 ? "M" : "L"}${xFor(i)} ${yFor(p.principalCumulative)}`
        )
        .join(" ");

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full max-w-full"
            preserveAspectRatio="xMidYMid meet"
        >
            <path
                d={pathBalance}
                fill="none"
                stroke="hsl(var(--primary, 220 80% 55%))"
                strokeWidth={2}
            />
            <path
                d={pathPrincipal}
                fill="none"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
                strokeDasharray="4 4"
            />
            {/* axes */}
            <line
                x1={pad.l}
                x2={pad.l}
                y1={pad.t}
                y2={pad.t + innerH}
                stroke="hsl(var(--border))"
            />
            <line
                x1={pad.l}
                x2={pad.l + innerW}
                y1={pad.t + innerH}
                y2={pad.t + innerH}
                stroke="hsl(var(--border))"
            />
            <text
                x={pad.l + 4}
                y={pad.t + 12}
                fontSize="10"
                fill="currentColor"
                opacity={0.6}
            >
                Maturity BDT {Math.round(maxBalance).toLocaleString()}
            </text>
        </svg>
    );
}

type ScheduleRow = RouterOutput["dps"]["getById"]["schedule"][number];

function ScheduleTable({
    rows,
    schemeId,
    sourceAccountOptions,
    defaultSourceAccountId,
    disabled,
}: {
    rows: ScheduleRow[];
    schemeId: string;
    sourceAccountOptions: { id: string; name: string }[];
    defaultSourceAccountId: string | null;
    disabled: boolean;
}) {
    const utils = trpc.useUtils();
    const markPaid = trpc.dps.markPaid.useMutation({
        onSuccess: () => {
            toast.success("Installment recorded");
            utils.dps.getById.invalidate({ schemeId });
            utils.dps.listBySpace.invalidate();
            utils.personal.dps.list.invalidate();
        },
        onError: (err) => toast.error(err.message),
    });
    const markMissed = trpc.dps.markMissed.useMutation({
        onSuccess: () => {
            toast.success("Marked as missed");
            utils.dps.getById.invalidate({ schemeId });
        },
        onError: (err) => toast.error(err.message),
    });

    const [showAll, setShowAll] = useState(false);
    const display = showAll ? rows : rows.slice(0, 24);

    return (
        <div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                        <tr>
                            <th className="py-1 text-left">#</th>
                            <th className="py-1 text-left">Due</th>
                            <th className="py-1 text-left">Status</th>
                            <th className="py-1 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {display.map((row) => (
                            <tr key={row.index} className="border-t border-border/40">
                                <td className="py-1.5">{row.index}</td>
                                <td className="py-1.5">
                                    {formatInAppTz(row.installmentDate, "d MMM yyyy")}
                                </td>
                                <td className="py-1.5">
                                    <StatusBadge status={row.status} />
                                </td>
                                <td className="py-1.5 text-right">
                                    {!disabled &&
                                        (row.status === "in_grace" ||
                                            row.status === "missed" ||
                                            row.status === "upcoming") && (
                                            <div className="inline-flex gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        if (!defaultSourceAccountId &&
                                                            sourceAccountOptions.length === 0
                                                        ) {
                                                            toast.error(
                                                                "No source account available"
                                                            );
                                                            return;
                                                        }
                                                        markPaid.mutate({
                                                            schemeId,
                                                            installmentDate: new Date(
                                                                row.installmentDate
                                                            ),
                                                            sourceAccountId:
                                                                defaultSourceAccountId ??
                                                                sourceAccountOptions[0]!.id,
                                                        });
                                                    }}
                                                >
                                                    Mark paid
                                                </Button>
                                                {row.status !== "missed" && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() =>
                                                            markMissed.mutate({
                                                                schemeId,
                                                                installmentDate: new Date(
                                                                    row.installmentDate
                                                                ),
                                                            })
                                                        }
                                                    >
                                                        Missed
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {rows.length > display.length && (
                <button
                    className="mt-2 text-xs text-muted-foreground underline"
                    onClick={() => setShowAll(true)}
                >
                    Show all {rows.length} installments
                </button>
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: ScheduleRow["status"] }) {
    if (status === "paid")
        return <Badge variant="default">Paid</Badge>;
    if (status === "in_grace")
        return <Badge variant="outline">Grace</Badge>;
    if (status === "missed")
        return (
            <Badge className="bg-red-500/15 text-red-600 dark:text-red-300">
                Missed
            </Badge>
        );
    return <Badge variant="secondary">Upcoming</Badge>;
}

function CloseDpsDialog({
    kind,
    open,
    onOpenChange,
    schemeId,
    defaultPayout,
    sourceAccountOptions,
}: {
    kind: "matured" | "encashed_early";
    open: boolean;
    onOpenChange: (b: boolean) => void;
    schemeId: string;
    defaultPayout: number;
    sourceAccountOptions: { id: string; name: string }[];
}) {
    const { key, rotate } = useIdempotencyKey();
    const utils = trpc.useUtils();
    const [date, setDate] = useState(toInputDate(new Date()));
    const [amount, setAmount] = useState(String(Math.round(defaultPayout)));
    const [accountId, setAccountId] = useState<string>(
        sourceAccountOptions[0]?.id ?? ""
    );

    const matured = trpc.dps.markMatured.useMutation({
        onSuccess: () => {
            toast.success("DPS marked matured");
            rotate();
            utils.dps.getById.invalidate({ schemeId });
            utils.dps.listBySpace.invalidate();
            utils.personal.dps.list.invalidate();
            utils.personal.dps.totals.invalidate();
            onOpenChange(false);
        },
        onError: (err) => toast.error(err.message),
    });
    const encashed = trpc.dps.encashEarly.useMutation({
        onSuccess: () => {
            toast.success("DPS encashed early");
            rotate();
            utils.dps.getById.invalidate({ schemeId });
            utils.dps.listBySpace.invalidate();
            utils.personal.dps.list.invalidate();
            utils.personal.dps.totals.invalidate();
            onOpenChange(false);
        },
        onError: (err) => toast.error(err.message),
    });

    const submit = () => {
        const payout = Number(amount);
        if (!Number.isFinite(payout) || payout <= 0)
            return toast.error("Payout amount must be positive");
        if (!accountId) return toast.error("Pick a destination account");

        if (kind === "matured") {
            matured.mutate({
                schemeId,
                maturityDate: new Date(date),
                payoutAmount: payout,
                payoutAccountId: accountId,
                idempotencyKey: key,
            });
        } else {
            encashed.mutate({
                schemeId,
                encashmentDate: new Date(date),
                payoutAmount: payout,
                payoutAccountId: accountId,
                idempotencyKey: key,
            });
        }
    };

    const isPending = matured.isPending || encashed.isPending;
    const title = kind === "matured" ? "Mark DPS matured" : "Encash DPS early";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>
                    Records the bank payout: drains the locked account
                    principal and credits the destination account with the
                    full payout amount.
                </DialogDescription>
                <div className="grid gap-3 py-2">
                    <div>
                        <Label htmlFor="close-date">
                            {kind === "matured" ? "Maturity date" : "Encashment date"}
                        </Label>
                        <Input
                            id="close-date"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <Label htmlFor="close-amount">Payout amount (BDT)</Label>
                        <Input
                            id="close-amount"
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                    </div>
                    <div>
                        <Label>Destination account</Label>
                        <Select value={accountId} onValueChange={setAccountId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Pick an account" />
                            </SelectTrigger>
                            <SelectContent>
                                {sourceAccountOptions.map((a) => (
                                    <SelectItem key={a.id} value={a.id}>
                                        {a.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isPending}
                    >
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={isPending}>
                        {isPending ? "Saving…" : "Confirm"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
