import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Trash2, UserPlus } from "lucide-react";
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

            <Tabs defaultValue="transactions">
                <TabsList>
                    <TabsTrigger value="transactions">Transactions</TabsTrigger>
                    <TabsTrigger value="members">Members</TabsTrigger>
                    <PermissionGate roles={["owner"]}>
                        <TabsTrigger value="settings">Settings</TabsTrigger>
                    </PermissionGate>
                </TabsList>

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
