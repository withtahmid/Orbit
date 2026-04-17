import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Loader2, Trash2, UserPlus, Target, Mail } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { AccountTypeBadge } from "@/components/shared/AccountTypeBadge";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { TransactionTypeBadge } from "@/components/shared/TransactionTypeBadge";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { EnvelopeAllocateDialog } from "@/features/allocations/EnvelopeAllocateDialog";
import { PlanAllocateDialog } from "@/features/allocations/PlanAllocateDialog";
import { Donut } from "@/components/shared/charts/Donut";
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
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import { format } from "date-fns";

export default function AccountDetailPage() {
    const { space } = useCurrentSpace();
    const { accountId } = useParams<{ accountId: string }>();
    const navigate = useNavigate();
    const utils = trpc.useUtils();

    const accountsQuery = trpc.account.listBySpace.useQuery({ spaceId: space.id });
    const account = accountsQuery.data?.find((a) => a.id === accountId);

    const txQuery = trpc.transaction.listBySpace.useQuery(
        { spaceId: space.id, accountId, limit: 50 },
        { enabled: !!accountId }
    );

    const usersQuery = trpc.account.listUsers.useQuery(
        { accountId: accountId! },
        { enabled: !!accountId }
    );

    const [newName, setNewName] = useState("");
    const update = trpc.account.update.useMutation({
        onSuccess: async () => {
            toast.success("Account updated");
            await utils.account.listBySpace.invalidate({ spaceId: space.id });
            setNewName("");
        },
        onError: (e) => toast.error(e.message),
    });
    const del = trpc.account.delete.useMutation({
        onSuccess: async () => {
            toast.success("Account deleted");
            await utils.account.listBySpace.invalidate({ spaceId: space.id });
            navigate(ROUTES.spaceAccounts(space.id));
        },
        onError: (e) => toast.error(e.message),
    });

    if (accountsQuery.isLoading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
        );
    }
    if (!account) {
        return (
            <div className="grid gap-4">
                <Button asChild variant="ghost" size="sm">
                    <Link to={ROUTES.spaceAccounts(space.id)}>
                        <ArrowLeft />
                        All accounts
                    </Link>
                </Button>
                <p className="text-muted-foreground">Account not found.</p>
            </div>
        );
    }

    return (
        <div className="grid gap-6">
            <Button asChild variant="ghost" size="sm" className="w-fit">
                <Link to={ROUTES.spaceAccounts(space.id)}>
                    <ArrowLeft />
                    All accounts
                </Link>
            </Button>
            <PageHeader
                title={account.name}
                description={
                    <span className="flex items-center gap-2">
                        <AccountTypeBadge type={account.account_type} />
                        <span className="text-sm text-muted-foreground">
                            Current balance:
                        </span>
                        <MoneyDisplay amount={account.balance} className="text-sm" />
                    </span>
                }
            />

            <Tabs defaultValue="allocations">
                <TabsList className="h-auto flex-wrap">
                    <TabsTrigger value="allocations">Allocations</TabsTrigger>
                    <TabsTrigger value="transactions">Transactions</TabsTrigger>
                    <TabsTrigger value="shared">Shared with</TabsTrigger>
                    <TabsTrigger value="members">Members</TabsTrigger>
                    <PermissionGate roles={["owner"]}>
                        <TabsTrigger value="settings">Settings</TabsTrigger>
                    </PermissionGate>
                </TabsList>

                <TabsContent value="allocations">
                    <AccountAllocationsTab spaceId={space.id} accountId={account.id} />
                </TabsContent>

                <TabsContent value="shared">
                    <SharedSpacesTab
                        accountId={account.id}
                        currentSpaceId={space.id}
                    />
                </TabsContent>

                <TabsContent value="transactions">
                    <Card className="p-0">
                        {txQuery.isLoading ? (
                            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
                        ) : !txQuery.data || txQuery.data.items.length === 0 ? (
                            <div className="p-6 text-center text-sm text-muted-foreground">
                                No transactions for this account yet.
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {txQuery.data.items.map((t) => {
                                        const isIncoming =
                                            t.destination_account_id === account.id;
                                        return (
                                            <TableRow key={t.id}>
                                                <TableCell className="text-muted-foreground">
                                                    {format(
                                                        new Date(t.transaction_datetime),
                                                        "MMM d"
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <TransactionTypeBadge
                                                        type={t.type as any}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {t.description ?? "—"}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <MoneyDisplay
                                                        amount={t.amount}
                                                        variant={isIncoming ? "income" : "expense"}
                                                        signed
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        )}
                    </Card>
                </TabsContent>

                <TabsContent value="members">
                    <Card className="p-0">
                        {usersQuery.isLoading ? (
                            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead className="w-12" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(usersQuery.data ?? []).map((u: any) => (
                                        <TableRow key={u.id}>
                                            <TableCell className="font-medium">
                                                {u.first_name} {u.last_name}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {u.email}
                                            </TableCell>
                                            <TableCell className="capitalize">{u.role}</TableCell>
                                            <TableCell>
                                                <PermissionGate roles={["owner"]}>
                                                    <RemoveAccountMember
                                                        accountId={account.id}
                                                        userId={u.id}
                                                    />
                                                </PermissionGate>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                        <PermissionGate roles={["owner"]}>
                            <AddAccountMember accountId={account.id} />
                        </PermissionGate>
                    </Card>
                </TabsContent>

                <TabsContent value="settings">
                    <Card>
                        <CardHeader>
                            <CardTitle>Rename account</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form
                                className="flex gap-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (!newName.trim()) return;
                                    update.mutate({
                                        accountId: account.id,
                                        name: newName.trim(),
                                    });
                                }}
                            >
                                <Input
                                    placeholder={account.name}
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                />
                                <Button type="submit" disabled={!newName.trim() || update.isPending}>
                                    Save
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                    <Card className="mt-6 border-destructive/40">
                        <CardHeader>
                            <CardTitle className="text-destructive">Danger zone</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ConfirmDialog
                                trigger={
                                    <Button variant="destructive">
                                        <Trash2 />
                                        Delete account
                                    </Button>
                                }
                                title="Delete this account?"
                                description="This will remove the account and all its transactions from this space."
                                confirmLabel="Delete"
                                destructive
                                typedConfirmationText={account.name}
                                onConfirm={() => del.mutate({ accountId: account.id })}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

function RemoveAccountMember({ accountId, userId }: { accountId: string; userId: string }) {
    const utils = trpc.useUtils();
    const remove = trpc.account.removeMember.useMutation({
        onSuccess: async () => {
            toast.success("Removed from account");
            await utils.account.listUsers.invalidate({ accountId });
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => remove.mutate({ accountId, userIds: [userId] })}
            disabled={remove.isPending}
        >
            <Trash2 className="text-destructive" />
        </Button>
    );
}

function AddAccountMember({ accountId }: { accountId: string }) {
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<"owner" | "viewer">("viewer");
    const utils = trpc.useUtils();

    const findUser = trpc.auth.findUserByEmail.useQuery(
        { email },
        { enabled: email.length > 3 && email.includes("@") }
    );
    const addMember = trpc.account.addMember.useMutation({
        onSuccess: async () => {
            toast.success("Member added");
            await utils.account.listUsers.invalidate({ accountId });
            setEmail("");
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <div className="grid gap-2 border-t border-border/60 p-4 sm:flex sm:items-end">
            <div className="grid flex-1 gap-2">
                <Label>Add member by email</Label>
                <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                />
                {findUser.data && (
                    <p className="text-xs text-muted-foreground">
                        Found: {findUser.data.first_name} {findUser.data.last_name}
                    </p>
                )}
            </div>
            <div className="grid gap-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as any)}>
                    <SelectTrigger className="w-36">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <Button
                onClick={() => {
                    if (!findUser.data) {
                        toast.error("No user found with that email");
                        return;
                    }
                    addMember.mutate({
                        accountId,
                        users: [{ id: findUser.data.id, role }],
                    });
                }}
                disabled={!findUser.data || addMember.isPending}
            >
                <UserPlus />
                Add
            </Button>
        </div>
    );
}

function AccountAllocationsTab({
    spaceId,
    accountId,
}: {
    spaceId: string;
    accountId: string;
}) {
    const q = trpc.analytics.accountAllocation.useQuery({ spaceId, accountId });

    if (q.isLoading) {
        return (
            <div className="grid gap-3">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
            </div>
        );
    }

    if (!q.data) {
        return null;
    }

    const { balance, allocated, unallocated, envelopes, plans } = q.data;
    const allocationPct = balance > 0 ? Math.min(100, (allocated / balance) * 100) : 0;

    // Donut slices: one per envelope partition (remaining), one per plan
    // partition (allocated), plus an "Unallocated" slice when positive.
    // Spent money has already left the account, so it doesn't appear here —
    // this chart shows where the *current balance* is mentally parked.
    const UNALLOCATED_COLOR = "#64748b";
    const allocationDonut = [
        ...envelopes
            .filter((e) => e.remaining > 0)
            .map((e) => ({
                id: "env-" + e.envelopId,
                name: e.name,
                value: e.remaining,
                color: e.color,
                hint: `Envelope · ${e.cadence === "monthly" ? "monthly" : "rolling"}`,
            })),
        ...plans
            .filter((p) => p.allocated > 0)
            .map((p) => ({
                id: "plan-" + p.planId,
                name: p.name,
                value: p.allocated,
                color: p.color,
                hint: "Plan",
            })),
        ...(unallocated > 0
            ? [
                  {
                      id: "unallocated",
                      name: "Unallocated",
                      value: unallocated,
                      color: UNALLOCATED_COLOR,
                      hint: "Free to allocate to an envelope or plan",
                  },
              ]
            : []),
    ];

    return (
        <div className="grid gap-5">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        How this account&apos;s money is earmarked
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                    <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                Balance
                            </p>
                            <MoneyDisplay
                                amount={balance}
                                className="block text-lg font-bold"
                            />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                Earmarked
                            </p>
                            <MoneyDisplay
                                amount={allocated}
                                className="block text-lg font-bold"
                            />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                Unallocated
                            </p>
                            <MoneyDisplay
                                amount={unallocated}
                                variant={unallocated < 0 ? "expense" : "neutral"}
                                className="block text-lg font-bold"
                            />
                        </div>
                    </div>
                    <Progress value={allocationPct} />
                    <p className="text-xs text-muted-foreground">
                        {allocationPct.toFixed(0)}% of this account&apos;s balance is
                        committed to envelopes or plans.
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Allocation map</CardTitle>
                </CardHeader>
                <CardContent>
                    <Donut
                        data={allocationDonut}
                        centerLabel="Balance"
                        centerValue={balance}
                        height={300}
                        emptyLabel="This account has no balance or allocations yet."
                    />
                    {unallocated < 0 && (
                        <p className="mt-3 text-xs text-destructive">
                            This account is over-allocated by{" "}
                            <MoneyDisplay
                                amount={Math.abs(unallocated)}
                                className="font-semibold text-destructive"
                            />
                            . Deallocate from an envelope or plan to rebalance.
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card className="p-0">
                <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Mail className="size-4" />
                        Envelopes at this account
                    </CardTitle>
                </CardHeader>
                {envelopes.length === 0 ? (
                    <CardContent>
                        <EmptyState
                            icon={Mail}
                            title="No envelope activity"
                            description="Allocate from this account on an envelope, or record an expense using a category routed to an envelope."
                        />
                    </CardContent>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Envelope</TableHead>
                                <TableHead className="text-right">Allocated</TableHead>
                                <TableHead className="text-right">Spent</TableHead>
                                <TableHead className="text-right">Remaining</TableHead>
                                <PermissionGate roles={["owner", "editor"]}>
                                    <TableHead className="w-24" />
                                </PermissionGate>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {envelopes.map((e) => (
                                <TableRow key={e.envelopId}>
                                    <TableCell>
                                        <Link
                                            to={ROUTES.spaceEnvelopeDetail(spaceId, e.envelopId)}
                                            className="inline-flex items-center gap-2 hover:text-primary"
                                        >
                                            <EntityAvatar
                                                size="sm"
                                                color={e.color}
                                                icon={e.icon}
                                            />
                                            <span className="text-sm font-medium">
                                                {e.name}
                                            </span>
                                            {e.isDrift && (
                                                <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                                                    <AlertTriangle className="size-3" />
                                                    Drift
                                                </span>
                                            )}
                                            {e.cadence === "monthly" && (
                                                <span className="rounded-sm bg-secondary px-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                                    Monthly
                                                </span>
                                            )}
                                        </Link>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <MoneyDisplay amount={e.allocated} />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <MoneyDisplay amount={e.consumed} variant="expense" />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <MoneyDisplay
                                            amount={e.remaining}
                                            variant={e.remaining < 0 ? "expense" : "neutral"}
                                        />
                                    </TableCell>
                                    <PermissionGate roles={["owner", "editor"]}>
                                        <TableCell>
                                            <EnvelopeAllocateDialog
                                                envelopId={e.envelopId}
                                                envelopCadence={e.cadence}
                                                defaultAccountId={accountId}
                                                direction="allocate"
                                                trigger={
                                                    <Button size="sm" variant="ghost">
                                                        Allocate
                                                    </Button>
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

            <Card className="p-0">
                <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Target className="size-4" />
                        Plans at this account
                    </CardTitle>
                </CardHeader>
                {plans.length === 0 ? (
                    <CardContent>
                        <EmptyState
                            icon={Target}
                            title="No plan activity"
                            description="Allocate from this account to a plan to see it here."
                        />
                    </CardContent>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Plan</TableHead>
                                <TableHead className="text-right">Allocated</TableHead>
                                <PermissionGate roles={["owner", "editor"]}>
                                    <TableHead className="w-24" />
                                </PermissionGate>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {plans.map((p) => (
                                <TableRow key={p.planId}>
                                    <TableCell>
                                        <Link
                                            to={ROUTES.spacePlanDetail(spaceId, p.planId)}
                                            className="inline-flex items-center gap-2 hover:text-primary"
                                        >
                                            <EntityAvatar
                                                size="sm"
                                                color={p.color}
                                                icon={p.icon}
                                            />
                                            <span className="text-sm font-medium">
                                                {p.name}
                                            </span>
                                        </Link>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <MoneyDisplay amount={p.allocated} />
                                    </TableCell>
                                    <PermissionGate roles={["owner", "editor"]}>
                                        <TableCell>
                                            <PlanAllocateDialog
                                                planId={p.planId}
                                                defaultAccountId={accountId}
                                                direction="allocate"
                                                trigger={
                                                    <Button size="sm" variant="ghost">
                                                        Allocate
                                                    </Button>
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

function SharedSpacesTab({
    accountId,
    currentSpaceId,
}: {
    accountId: string;
    currentSpaceId: string;
}) {
    const spacesQuery = trpc.account.listSpaces.useQuery({ accountId });
    const utils = trpc.useUtils();
    const unshare = trpc.account.unshareFromSpace.useMutation({
        onSuccess: async () => {
            toast.success("Account unshared from space");
            await Promise.all([
                utils.account.listSpaces.invalidate({ accountId }),
                utils.account.listBySpace.invalidate(),
                utils.account.listByUser.invalidate(),
            ]);
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <div className="grid gap-4">
            <Card>
                <CardHeader className="flex-row items-start justify-between gap-3">
                    <div>
                        <CardTitle className="text-base">Spaces</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                            This account can be used in every space listed below. Each
                            space keeps its own transactions and allocations; only the
                            cash balance is shared.
                        </p>
                    </div>
                    <PermissionGate roles={["owner", "editor"]}>
                        <ShareWithAnotherSpaceDialog
                            accountId={accountId}
                            alreadyIn={
                                spacesQuery.data?.map((s) => s.spaceId) ?? []
                            }
                        />
                    </PermissionGate>
                </CardHeader>
                <CardContent className="p-0">
                    {spacesQuery.isLoading ? (
                        <div className="p-4">
                            <Skeleton className="h-14 w-full" />
                        </div>
                    ) : (spacesQuery.data ?? []).length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground">
                            No spaces linked.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Space</TableHead>
                                    <TableHead>Your role</TableHead>
                                    <TableHead>Shared since</TableHead>
                                    <TableHead className="w-28" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(spacesQuery.data ?? []).map((s) => {
                                    const isCurrent = s.spaceId === currentSpaceId;
                                    const isOnly = (spacesQuery.data ?? []).length === 1;
                                    return (
                                        <TableRow key={s.spaceId}>
                                            <TableCell>
                                                <span className="flex items-center gap-2">
                                                    <Link
                                                        to={ROUTES.space(s.spaceId)}
                                                        className="font-medium hover:text-primary"
                                                    >
                                                        {s.name}
                                                    </Link>
                                                    {isCurrent && (
                                                        <span className="rounded-sm bg-primary/15 px-1.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                                                            Current
                                                        </span>
                                                    )}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-sm capitalize text-muted-foreground">
                                                {s.myRole ?? "—"}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {format(s.sharedAt, "MMM d, yyyy")}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {!isOnly && (
                                                    <ConfirmDialog
                                                        trigger={
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="text-destructive"
                                                            >
                                                                Unshare
                                                            </Button>
                                                        }
                                                        title={`Unshare from ${s.name}?`}
                                                        description="Transactions and allocations in that space tied to this account must be removed first."
                                                        confirmLabel="Unshare"
                                                        destructive
                                                        onConfirm={() =>
                                                            unshare.mutate({
                                                                accountId,
                                                                spaceId: s.spaceId,
                                                            })
                                                        }
                                                    />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function ShareWithAnotherSpaceDialog({
    accountId,
    alreadyIn,
}: {
    accountId: string;
    alreadyIn: string[];
}) {
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const utils = trpc.useUtils();
    const spacesQuery = trpc.space.list.useQuery();

    const share = trpc.account.shareWithSpace.useMutation({
        onSuccess: async () => {
            toast.success("Account shared");
            await Promise.all([
                utils.account.listSpaces.invalidate({ accountId }),
                utils.account.listBySpace.invalidate(),
                utils.account.listByUser.invalidate(),
            ]);
            setSelected(null);
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });

    const alreadySet = new Set(alreadyIn);
    const candidates = (spacesQuery.data ?? []).filter(
        (s) => !alreadySet.has(s.id) && (s.myRole === "owner" || s.myRole === "editor")
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="gradient" size="sm">
                    <UserPlus />
                    Share to another space
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Share this account</DialogTitle>
                    <DialogDescription>
                        Pick a space where you&apos;re an owner or editor. The account
                        becomes usable there &mdash; existing transactions stay where
                        they are.
                    </DialogDescription>
                </DialogHeader>
                <div className="max-h-[50vh] overflow-y-auto">
                    {spacesQuery.isLoading ? (
                        <Skeleton className="h-24 w-full" />
                    ) : candidates.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            No eligible spaces. The account is already in every space
                            you can share to.
                        </p>
                    ) : (
                        <div className="grid gap-1.5">
                            {candidates.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => setSelected(s.id)}
                                    className={`flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:border-foreground/30 ${
                                        selected === s.id
                                            ? "border-primary/60 bg-primary/5"
                                            : ""
                                    }`}
                                >
                                    <span className="text-sm font-medium">{s.name}</span>
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                        {s.myRole}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
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
                        variant="gradient"
                        disabled={!selected || share.isPending}
                        onClick={() =>
                            selected &&
                            share.mutate({ accountId, spaceId: selected })
                        }
                    >
                        {share.isPending ? "Sharing…" : "Share"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
