import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/trpc";
import { useCurrentSpace, useIsOwner } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";
import type { SpaceRole } from "@/lib/permissions";

export default function SpaceSettingsPage() {
    const { space } = useCurrentSpace();
    const isOwner = useIsOwner();
    const navigate = useNavigate();
    const utils = trpc.useUtils();

    const [newName, setNewName] = useState(space.name);
    const update = trpc.space.update.useMutation({
        onSuccess: async () => {
            toast.success("Space renamed");
            await utils.space.list.invalidate();
        },
        onError: (e) => toast.error(e.message),
    });
    const del = trpc.space.delete.useMutation({
        onSuccess: async () => {
            toast.success("Space deleted");
            await utils.space.list.invalidate();
            navigate(ROUTES.spaces, { replace: true });
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <div className="grid gap-6">
            <PageHeader title="Space settings" description="Manage this workspace" />

            <Tabs defaultValue="general">
                <TabsList>
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="members">Members</TabsTrigger>
                    {isOwner && <TabsTrigger value="danger">Danger</TabsTrigger>}
                </TabsList>

                <TabsContent value="general">
                    <Card>
                        <CardHeader>
                            <CardTitle>Space name</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form
                                className="flex gap-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (!newName.trim() || newName.trim() === space.name) return;
                                    update.mutate({
                                        spaceId: space.id,
                                        name: newName.trim(),
                                    });
                                }}
                            >
                                <Input
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    disabled={!isOwner}
                                    maxLength={255}
                                />
                                {isOwner && (
                                    <Button
                                        type="submit"
                                        disabled={
                                            !newName.trim() ||
                                            newName.trim() === space.name ||
                                            update.isPending
                                        }
                                    >
                                        Save
                                    </Button>
                                )}
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="members">
                    <MembersCard />
                </TabsContent>

                <TabsContent value="danger">
                    <Card className="border-destructive/40">
                        <CardHeader>
                            <CardTitle className="text-destructive">Delete space</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3">
                            <p className="text-sm text-muted-foreground">
                                Deleting the space removes all its accounts, transactions,
                                envelopes, plans, and categories. This cannot be undone.
                            </p>
                            <PermissionGate roles={["owner"]}>
                                <ConfirmDialog
                                    trigger={
                                        <Button variant="destructive" className="w-fit">
                                            <Trash2 />
                                            Delete this space
                                        </Button>
                                    }
                                    title="Delete this space?"
                                    description="All data will be permanently removed."
                                    confirmLabel="Delete"
                                    destructive
                                    typedConfirmationText={space.name}
                                    onConfirm={() => del.mutate({ spaceId: space.id })}
                                />
                            </PermissionGate>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

function MembersCard() {
    const { space } = useCurrentSpace();
    const isOwner = useIsOwner();
    const membersQuery = trpc.space.memberList.useQuery({ spaceId: space.id });

    return (
        <Card className="p-0">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        {isOwner && <TableHead className="w-12" />}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {(membersQuery.data ?? []).map((m: any) => (
                        <TableRow key={m.id}>
                            <TableCell className="font-medium">
                                <span className="inline-flex items-center gap-2">
                                    <UserAvatar
                                        fileId={m.avatar_file_id}
                                        firstName={m.first_name}
                                        lastName={m.last_name}
                                        size="sm"
                                    />
                                    {m.first_name} {m.last_name}
                                </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{m.email}</TableCell>
                            <TableCell>
                                {isOwner ? (
                                    <RoleSelect userId={m.id} role={m.role as SpaceRole} />
                                ) : (
                                    <RoleBadge role={m.role as SpaceRole} />
                                )}
                            </TableCell>
                            {isOwner && (
                                <TableCell>
                                    <RemoveMember userId={m.id} />
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <PermissionGate roles={["owner", "editor"]}>
                <AddMember />
            </PermissionGate>
        </Card>
    );
}

function RoleSelect({ userId, role }: { userId: string; role: SpaceRole }) {
    const { space } = useCurrentSpace();
    const utils = trpc.useUtils();
    const change = trpc.space.changeMemberRole.useMutation({
        onSuccess: async () => {
            toast.success("Role updated");
            await utils.space.memberList.invalidate({ spaceId: space.id });
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <Select
            value={role}
            onValueChange={(v) =>
                change.mutate({
                    spaceId: space.id,
                    userId,
                    role: v as any,
                })
            }
        >
            <SelectTrigger className="h-8 w-28">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
        </Select>
    );
}

function RemoveMember({ userId }: { userId: string }) {
    const { space } = useCurrentSpace();
    const utils = trpc.useUtils();
    const remove = trpc.space.removeMember.useMutation({
        onSuccess: async () => {
            toast.success("Member removed");
            await utils.space.memberList.invalidate({ spaceId: space.id });
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => remove.mutate({ spaceId: space.id, userIds: [userId] })}
            disabled={remove.isPending}
        >
            <Trash2 className="size-3.5 text-destructive" />
        </Button>
    );
}

function AddMember() {
    const { space } = useCurrentSpace();
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<SpaceRole>("editor");
    const utils = trpc.useUtils();

    const findUser = trpc.auth.findUserByEmail.useQuery(
        { email },
        { enabled: email.length > 3 && email.includes("@") }
    );
    const add = trpc.space.addMembers.useMutation({
        onSuccess: async () => {
            toast.success("Member added");
            await utils.space.memberList.invalidate({ spaceId: space.id });
            setEmail("");
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <div className="grid gap-2 border-t border-border/60 p-4 sm:flex sm:items-end">
            <div className="grid flex-1 gap-2">
                <Label>Invite by email</Label>
                <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                />
                {findUser.data && (
                    <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        Found:
                        <UserAvatar
                            fileId={findUser.data.avatar_file_id}
                            firstName={findUser.data.first_name}
                            lastName={findUser.data.last_name}
                            size="sm"
                        />
                        {findUser.data.first_name} {findUser.data.last_name}
                    </p>
                )}
            </div>
            <div className="grid gap-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as any)}>
                    <SelectTrigger className="w-28">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <Button
                onClick={() => {
                    if (!findUser.data) {
                        toast.error("User not found");
                        return;
                    }
                    add.mutate({
                        spaceId: space.id,
                        members: [{ userId: findUser.data.id, role }],
                    });
                }}
                disabled={!findUser.data || add.isPending}
            >
                <UserPlus />
                Invite
            </Button>
        </div>
    );
}
