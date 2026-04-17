import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/trpc";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";

export const EmailStep = observer(function EmailStep() {
    const { forgotPasswordStore } = useStore();
    const [email, setEmail] = useState(forgotPasswordStore.email || "");

    const initiate = trpc.auth.resetPassword.initiate.useMutation({
        onSuccess: (data) => {
            forgotPasswordStore.setEmail(email);
            if (data.token) {
                forgotPasswordStore.setResetToken(data.token);
                forgotPasswordStore.setStep(2);
                forgotPasswordStore.startResendCooldown(60);
            }
            toast.success(data.message || "If the account exists, a code was sent.");
        },
        onError: (e) => toast.error(e.message),
    });

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        initiate.mutate({ email });
    };

    return (
        <div className="grid gap-5 py-2 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-brand-gradient-to/20 text-primary">
                <KeyRound className="size-6" />
            </div>
            <div>
                <h2 className="text-xl font-bold">Reset your password</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    We&apos;ll send a verification code to your email
                </p>
            </div>
            <form onSubmit={onSubmit} className="grid gap-3 text-left">
                <Label htmlFor="email">Email</Label>
                <Input
                    id="email"
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                />
                <Button
                    type="submit"
                    variant="gradient"
                    disabled={initiate.isPending || !email}
                >
                    {initiate.isPending ? (
                        <>
                            <Loader2 className="animate-spin" />
                            Sending…
                        </>
                    ) : (
                        "Send code"
                    )}
                </Button>
            </form>
            <Link
                to={ROUTES.login}
                className="text-xs text-muted-foreground hover:text-foreground"
            >
                ← Back to login
            </Link>
        </div>
    );
});
