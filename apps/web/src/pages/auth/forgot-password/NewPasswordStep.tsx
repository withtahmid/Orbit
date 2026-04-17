import { useState, type FormEvent } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router-dom";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/trpc";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";

export const NewPasswordStep = observer(function NewPasswordStep() {
    const { forgotPasswordStore } = useStore();
    const navigate = useNavigate();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const complete = trpc.auth.resetPassword.complete.useMutation({
        onSuccess: () => {
            toast.success("Password reset. Please sign in.");
            forgotPasswordStore.reset();
            navigate(ROUTES.login, { replace: true });
        },
        onError: (e) => toast.error(e.message),
    });

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (password.length < 8) {
            toast.error("Password must be at least 8 characters");
            return;
        }
        if (password !== confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }
        if (!forgotPasswordStore.resetToken) return;
        complete.mutate({
            token: forgotPasswordStore.resetToken,
            password,
            confirmPassword,
        });
    };

    return (
        <div className="grid gap-5 py-2">
            <div className="text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-brand-gradient-to/20 text-primary">
                    <KeyRound className="size-6" />
                </div>
                <h2 className="mt-4 text-xl font-bold">Choose a new password</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Pick something secure and easy to remember
                </p>
            </div>
            <form onSubmit={onSubmit} className="grid gap-3">
                <Label htmlFor="pw">New password</Label>
                <Input
                    id="pw"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                <Label htmlFor="pwc">Confirm password</Label>
                <Input
                    id="pwc"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <Button
                    type="submit"
                    variant="gradient"
                    disabled={complete.isPending}
                    className="mt-1"
                >
                    {complete.isPending ? (
                        <>
                            <Loader2 className="animate-spin" />
                            Updating…
                        </>
                    ) : (
                        "Reset password"
                    )}
                </Button>
            </form>
        </div>
    );
});
