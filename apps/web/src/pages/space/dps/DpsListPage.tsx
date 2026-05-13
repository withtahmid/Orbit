import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PiggyBank, Plus, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc, type RouterOutput } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import { CreateDpsDialog } from "@/features/dps/CreateDpsDialog";
import { formatInAppTz } from "@/lib/formatDate";

type Row = RouterOutput["dps"]["listBySpace"][number];

export default function DpsListPage() {
    const { space, isPersonal } = useCurrentSpace();
    const [includeClosed, setIncludeClosed] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);

    const personalQuery = trpc.personal.dps.list.useQuery(
        { includeClosed },
        { enabled: isPersonal }
    );
    const spaceQuery = trpc.dps.listBySpace.useQuery(
        { spaceId: space.id, includeClosed },
        { enabled: !isPersonal }
    );

    const accountsQuery = trpc.account.listBySpace.useQuery(
        { spaceId: space.id },
        { enabled: !isPersonal }
    );

    const rows = isPersonal ? personalQuery.data : spaceQuery.data;
    const isLoading = isPersonal ? personalQuery.isLoading : spaceQuery.isLoading;

    const totals = useMemo(() => {
        if (!rows)
            return {
                principal: 0,
                interestSoFar: 0,
                projected: 0,
                monthlyCommitment: 0,
                count: 0,
            };
        return rows.reduce(
            (acc, r) => ({
                principal: acc.principal + r.currentPrincipal,
                interestSoFar: acc.interestSoFar + r.projectedInterestSoFar,
                projected: acc.projected + r.projectedMaturityNet,
                monthlyCommitment:
                    acc.monthlyCommitment +
                    (r.status === "active" ? r.monthlyCommitment : 0),
                count: acc.count + 1,
            }),
            {
                principal: 0,
                interestSoFar: 0,
                projected: 0,
                monthlyCommitment: 0,
                count: 0,
            }
        );
    }, [rows]);

    const sourceAccountOptions =
        (accountsQuery.data ?? [])
            .filter((a) => a.account_type !== "locked")
            .map((a) => ({ id: a.id, name: a.name }));

    return (
        <div className="grid gap-5 sm:gap-6">
            <PageHeader
                title="DPS"
                description="Deposit Pension Scheme contracts. Principal lives in a locked account; interest accrues on bank books and is realized at maturity."
                actions={
                    isPersonal ? null : (
                        <Button onClick={() => setCreateOpen(true)}>
                            <Plus className="mr-1 h-4 w-4" />
                            New DPS
                        </Button>
                    )
                }
            />

            {rows && rows.length > 0 && (
                <Card>
                    <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
                        <Stat
                            label="Active schemes"
                            value={String(rows.filter((r) => r.status === "active").length)}
                        />
                        <Stat
                            label="Principal so far"
                            value={<MoneyDisplay amount={totals.principal} />}
                        />
                        <Stat
                            label="Interest (estimated)"
                            value={
                                <MoneyDisplay
                                    amount={totals.interestSoFar}
                                    variant="income"
                                />
                            }
                        />
                        <Stat
                            label="Monthly commitment"
                            value={
                                <MoneyDisplay
                                    amount={totals.monthlyCommitment}
                                    variant="transfer"
                                />
                            }
                        />
                    </CardContent>
                </Card>
            )}

            {isLoading ? (
                <div className="grid gap-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-32 rounded-xl" />
                    ))}
                </div>
            ) : rows && rows.length > 0 ? (
                <div className="grid gap-3">
                    {rows.map((r) => (
                        <DpsCard key={r.schemeId} row={r} spaceId={space.id} />
                    ))}
                </div>
            ) : (
                <EmptyState
                    icon={PiggyBank}
                    title="No DPS schemes yet"
                    description={
                        isPersonal
                            ? "Open a real space to add your first DPS — the personal view is read-only."
                            : "Add your first Deposit Pension Scheme to track principal, interest, and maturity."
                    }
                />
            )}

            <div className="flex justify-end">
                <button
                    className="text-xs text-muted-foreground underline"
                    onClick={() => setIncludeClosed((v) => !v)}
                >
                    {includeClosed ? "Hide closed schemes" : "Show closed schemes"}
                </button>
            </div>

            {!isPersonal && (
                <CreateDpsDialog
                    open={createOpen}
                    onOpenChange={setCreateOpen}
                    spaceId={space.id}
                    sourceAccountOptions={sourceAccountOptions}
                />
            )}
        </div>
    );
}

function Stat({
    label,
    value,
}: {
    label: string;
    value: React.ReactNode;
}) {
    return (
        <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {label}
            </div>
            <div className="mt-1 text-lg font-medium">{value}</div>
        </div>
    );
}

function DpsCard({ row, spaceId }: { row: Row; spaceId: string }) {
    return (
        <Link to={ROUTES.spaceDpsDetail(spaceId, row.schemeId)} className="block">
            <Card className="transition hover:border-foreground/30">
                <CardContent className="grid gap-3 p-4 sm:grid-cols-[2fr_1fr_1fr] sm:items-center">
                    <div>
                        <div className="flex items-center gap-2">
                            <div className="font-medium">
                                {row.schemeName || `${row.bankName} DPS`}
                            </div>
                            <Badge variant={row.status === "active" ? "default" : "secondary"}>
                                {row.status === "active"
                                    ? "Active"
                                    : row.status === "matured"
                                    ? "Matured"
                                    : row.status === "encashed_early"
                                    ? "Encashed"
                                    : "Abandoned"}
                            </Badge>
                            {row.missedCount > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-700 dark:text-yellow-300">
                                    <AlertTriangle className="h-3 w-3" />
                                    {row.missedCount} missed
                                </span>
                            )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {row.bankName} · BDT {row.installmentAmount.toLocaleString()}/mo ·{" "}
                            {row.termMonths} months ·{" "}
                            {(row.annualRateBps / 100).toFixed(2)}% ·{" "}
                            {row.compounding}
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                            <Progress value={row.progressPct} className="h-1.5 w-40" />
                            <span className="text-xs text-muted-foreground">
                                {Math.round(row.progressPct)}% · {row.monthsElapsed}/
                                {row.termMonths} mo
                            </span>
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">Principal</div>
                        <MoneyDisplay amount={row.currentPrincipal} />
                        <div className="mt-1 text-xs text-muted-foreground">
                            Interest est.
                        </div>
                        <MoneyDisplay
                            amount={row.projectedInterestSoFar}
                            variant="income"
                        />
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">
                            Projected maturity (net)
                        </div>
                        <MoneyDisplay amount={row.projectedMaturityNet} />
                        <div className="mt-1 text-xs text-muted-foreground">
                            Matures {formatInAppTz(row.maturityDate, "d MMM yyyy")}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
