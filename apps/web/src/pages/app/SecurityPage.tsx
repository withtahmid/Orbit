import { useState } from "react";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { trpc } from "@/trpc";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";

export default function SecurityPage() {
    const { authStore } = useStore();
    const navigate = useNavigate();

    return (
        <div className="grid gap-6">
            <PageHeader title="Security" description="Manage your account security" />

            <PasswordCard />

            <Card>
                <CardHeader>
                    <CardTitle>Session</CardTitle>
                    <CardDescription>Sign out of this device</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button
                        variant="destructive"
                        onClick={() => {
                            authStore.clearAuth();
                            navigate(ROUTES.login, { replace: true });
                        }}
                    >
                        Log out
                    </Button>
                </CardContent>
            </Card>

            <DeleteAccountCard />
        </div>
    );
}

function PasswordCard() {
    const { authStore } = useStore();
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");

    const change = trpc.user.changePassword.useMutation({
        onSuccess: ({ token }) => {
            // Server bumps token_version on password change, which kills
            // every other session. Refresh the local token so this tab
            // keeps working without a forced re-login.
            authStore.setToken(token);
            toast.success("Password updated. Other sessions have been signed out.");
            setCurrent("");
            setNext("");
            setConfirm("");
        },
        onError: (e) => toast.error(e.message),
    });

    const valid =
        current.length > 0 &&
        next.length >= 8 &&
        confirm.length >= 8 &&
        next === confirm &&
        next !== current;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Password</CardTitle>
                <CardDescription>
                    Enter your current password to set a new one. Forgot it?{" "}
                    <Link
                        to={ROUTES.forgotPassword}
                        className="underline underline-offset-2 hover:text-foreground"
                    >
                        Reset by email
                    </Link>
                    .
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form
                    className="grid gap-3 sm:max-w-md"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!valid) return;
                        change.mutate({
                            currentPassword: current,
                            newPassword: next,
                            confirmPassword: confirm,
                        });
                    }}
                >
                    <div className="grid gap-1.5">
                        <Label htmlFor="sec-current-pw">Current password</Label>
                        <Input
                            id="sec-current-pw"
                            type="password"
                            value={current}
                            onChange={(e) => setCurrent(e.target.value)}
                            autoComplete="current-password"
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="sec-new-pw">New password</Label>
                        <Input
                            id="sec-new-pw"
                            type="password"
                            value={next}
                            onChange={(e) => setNext(e.target.value)}
                            autoComplete="new-password"
                            minLength={8}
                        />
                        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="sec-confirm-pw">Confirm new password</Label>
                        <Input
                            id="sec-confirm-pw"
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            autoComplete="new-password"
                            minLength={8}
                            aria-invalid={
                                confirm.length > 0 && confirm !== next ? true : undefined
                            }
                        />
                        {confirm.length > 0 && confirm !== next && (
                            <p className="text-xs text-destructive">Passwords do not match.</p>
                        )}
                    </div>
                    <div>
                        <Button type="submit" disabled={!valid || change.isPending}>
                            {change.isPending ? "Updating…" : "Update password"}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}

function DeleteAccountCard() {
    const { authStore } = useStore();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [pw, setPw] = useState("");

    const del = trpc.user.deleteAccount.useMutation({
        onSuccess: () => {
            toast.success("Account deleted");
            authStore.clearAuth();
            navigate(ROUTES.login, { replace: true });
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <Card className="border-destructive/40">
            <CardHeader>
                <CardTitle className="text-destructive">Delete account</CardTitle>
                <CardDescription>
                    Anonymizes your profile, signs you out everywhere, and removes you from every
                    space. Historical transactions you authored stay attached to a placeholder
                    name. This cannot be undone.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ConfirmDialog
                    open={open}
                    onOpenChange={(v) => {
                        setOpen(v);
                        if (!v) setPw("");
                    }}
                    trigger={
                        <Button variant="destructive" onClick={() => setOpen(true)}>
                            Delete my account…
                        </Button>
                    }
                    title="Delete your account?"
                    destructive
                    confirmLabel={del.isPending ? "Deleting…" : "Delete account"}
                    typedConfirmationText="DELETE"
                    outcomes={[
                        {
                            kind: "irreversible",
                            text: "Your name, email, and avatar are anonymized. Every active session is signed out.",
                        },
                        {
                            kind: "irreversible",
                            text: "You're removed from every space; pending invites you sent are revoked.",
                        },
                        {
                            kind: "irreversible",
                            text: "Refused if you are the sole owner of any space — transfer or delete it first.",
                        },
                        {
                            kind: "ok",
                            text: "Historical transactions and balances you authored stay intact under a placeholder name.",
                        },
                    ]}
                    description={
                        <div className="grid gap-1.5">
                            <Label htmlFor="del-acct-pw" className="text-xs">
                                Confirm with your current password
                            </Label>
                            <Input
                                id="del-acct-pw"
                                type="password"
                                value={pw}
                                onChange={(e) => setPw(e.target.value)}
                                autoComplete="current-password"
                            />
                        </div>
                    }
                    onConfirm={() => {
                        if (!pw) {
                            toast.error("Enter your password to confirm");
                            return;
                        }
                        del.mutate({ currentPassword: pw });
                    }}
                />
            </CardContent>
        </Card>
    );
}
