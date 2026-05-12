import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/router/routes";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useStore } from "@/stores/useStore";

export default function ProfilePage() {
    const meQuery = trpc.auth.me.useQuery();
    const utils = trpc.useUtils();
    const { authStore } = useStore();
    const { upload, uploading } = useFileUpload();
    const updateAvatar = trpc.user.updateAvatar.useMutation();
    const inputRef = useRef<HTMLInputElement>(null);

    const onPick = async (file: File) => {
        try {
            const fileId = await upload(file, "avatar");
            await updateAvatar.mutateAsync({ fileId });
            authStore.setAvatarFileId(fileId);
            await utils.auth.me.invalidate();
            toast.success("Avatar updated");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Upload failed");
        }
    };

    return (
        <div className="grid gap-6">
            <PageHeader
                title="Profile"
                description="Your personal information"
                actions={
                    <Button asChild variant="outline">
                        <Link to={ROUTES.security}>Security settings</Link>
                    </Button>
                }
            />
            <Card>
                <CardHeader className="flex-row items-center gap-4 md:flex-row">
                    <div className="relative">
                        <UserAvatar
                            fileId={meQuery.data?.avatar_file_id}
                            firstName={meQuery.data?.first_name}
                            lastName={meQuery.data?.last_name}
                            size="lg"
                        />
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            disabled={uploading || updateAvatar.isPending}
                            className="absolute -bottom-1 -right-1 rounded-full border bg-background p-1 shadow-sm hover:bg-accent disabled:opacity-50"
                            aria-label="Change avatar"
                        >
                            {uploading || updateAvatar.isPending ? (
                                <Loader2 className="size-3 animate-spin" />
                            ) : (
                                <Camera className="size-3" />
                            )}
                        </button>
                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void onPick(f);
                                e.target.value = "";
                            }}
                        />
                    </div>
                    <div className="flex-1">
                        {meQuery.isLoading ? (
                            <Skeleton className="h-6 w-40" />
                        ) : (
                            <CardTitle>
                                {meQuery.data?.first_name} {meQuery.data?.last_name}
                            </CardTitle>
                        )}
                        {meQuery.isLoading ? (
                            <Skeleton className="mt-2 h-4 w-56" />
                        ) : (
                            <CardDescription>{meQuery.data?.email}</CardDescription>
                        )}
                    </div>
                </CardHeader>
                <Separator />
                <CardContent className="grid gap-6 pt-6">
                    {meQuery.data && (
                        <>
                            <NameForm
                                firstName={meQuery.data.first_name}
                                lastName={meQuery.data.last_name}
                            />
                            <Separator />
                            <EmailForm currentEmail={meQuery.data.email} />
                            <Separator />
                            <InfoRow label="User ID" value={meQuery.data.id} mono />
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function NameForm({ firstName, lastName }: { firstName: string; lastName: string }) {
    const utils = trpc.useUtils();
    const { authStore } = useStore();
    const [first, setFirst] = useState(firstName);
    const [last, setLast] = useState(lastName);

    useEffect(() => {
        setFirst(firstName);
        setLast(lastName);
    }, [firstName, lastName]);

    const update = trpc.user.updateProfile.useMutation({
        onSuccess: async (row) => {
            toast.success("Profile updated");
            if (authStore.user) {
                authStore.setAuth(authStore.token!, {
                    ...authStore.user,
                    name: `${row.first_name} ${row.last_name}`.trim(),
                });
            }
            await utils.auth.me.invalidate();
            await utils.space.list.invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const dirty = first.trim() !== firstName || last.trim() !== lastName;
    const valid = first.trim().length > 0 && last.trim().length > 0;

    return (
        <form
            className="grid gap-3"
            onSubmit={(e) => {
                e.preventDefault();
                if (!dirty || !valid) return;
                update.mutate({ firstName: first.trim(), lastName: last.trim() });
            }}
        >
            <div className="grid gap-1">
                <p className="text-sm font-medium">Name</p>
                <p className="text-xs text-muted-foreground">
                    Shown to people in the spaces you share.
                </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                    <Label htmlFor="profile-first-name">First name</Label>
                    <Input
                        id="profile-first-name"
                        value={first}
                        onChange={(e) => setFirst(e.target.value)}
                        maxLength={100}
                        autoComplete="given-name"
                    />
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="profile-last-name">Last name</Label>
                    <Input
                        id="profile-last-name"
                        value={last}
                        onChange={(e) => setLast(e.target.value)}
                        maxLength={100}
                        autoComplete="family-name"
                    />
                </div>
            </div>
            <div>
                <Button type="submit" disabled={!dirty || !valid || update.isPending}>
                    {update.isPending ? "Saving…" : "Save name"}
                </Button>
            </div>
        </form>
    );
}

function EmailForm({ currentEmail }: { currentEmail: string }) {
    const utils = trpc.useUtils();
    const { authStore } = useStore();
    const [email, setEmail] = useState(currentEmail);
    const [pw, setPw] = useState("");
    const [open, setOpen] = useState(false);

    useEffect(() => {
        setEmail(currentEmail);
    }, [currentEmail]);

    const change = trpc.user.changeEmail.useMutation({
        onSuccess: async (row) => {
            toast.success("Email updated");
            if (authStore.user) {
                authStore.setAuth(authStore.token!, {
                    ...authStore.user,
                    email: row.email,
                });
            }
            setPw("");
            setOpen(false);
            await utils.auth.me.invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const dirty = email.trim().toLowerCase() !== currentEmail.toLowerCase();
    const valid = /.+@.+\..+/.test(email.trim());

    return (
        <div className="grid gap-3">
            <div className="grid gap-1">
                <p className="text-sm font-medium">Email</p>
                <p className="text-xs text-muted-foreground">
                    Used for sign-in and account notifications.
                </p>
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor="profile-email">Email address</Label>
                <Input
                    id="profile-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                        setEmail(e.target.value);
                        if (e.target.value.trim().toLowerCase() === currentEmail.toLowerCase()) {
                            setOpen(false);
                        }
                    }}
                    autoComplete="email"
                />
            </div>
            {dirty && !open && (
                <div>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={!valid}
                        onClick={() => setOpen(true)}
                    >
                        Continue
                    </Button>
                </div>
            )}
            {dirty && open && (
                <form
                    className="grid gap-3 rounded-md border border-border/60 bg-muted/30 p-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!valid || !pw) return;
                        change.mutate({ email: email.trim(), currentPassword: pw });
                    }}
                >
                    <div className="grid gap-1.5">
                        <Label htmlFor="profile-email-pw">Confirm with current password</Label>
                        <Input
                            id="profile-email-pw"
                            type="password"
                            value={pw}
                            onChange={(e) => setPw(e.target.value)}
                            autoComplete="current-password"
                            autoFocus
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button type="submit" disabled={!pw || change.isPending}>
                            {change.isPending ? "Updating…" : "Update email"}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                                setEmail(currentEmail);
                                setPw("");
                                setOpen(false);
                            }}
                        >
                            Cancel
                        </Button>
                    </div>
                </form>
            )}
        </div>
    );
}

function InfoRow({
    label,
    value,
    mono,
}: {
    label: string;
    value: string;
    mono?: boolean;
}) {
    return (
        <div className="grid gap-1 sm:grid-cols-[160px_1fr] sm:items-center">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={mono ? "break-all font-mono text-sm" : "text-sm"}>{value}</p>
        </div>
    );
}
