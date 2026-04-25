import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/trpc";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";

export const EmailStep = observer(function EmailStep() {
    const { signupStore } = useStore();
    const [email, setEmail] = useState(signupStore.email || "");

    const initiate = trpc.auth.signup.initiate.useMutation({
        onSuccess: (data) => {
            signupStore.setEmail(email);
            signupStore.setSignupToken(data.token);
            signupStore.setStep(2);
            signupStore.startResendCooldown(60);
            toast.success("Verification code sent");
        },
        onError: (e) => toast.error(e.message),
    });

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        initiate.mutate({ email });
    };

    return (
        <div className="grid gap-6">
            <div>
                <p className="o-eyebrow mb-3 flex items-center gap-2">
                    <Mail className="size-3.5" />
                    <span>Create account</span>
                </p>
                <h1 className="o-page-title">Start tracking.</h1>
                <p className="o-page-sub mt-3">
                    Enter your email. We'll send a verification code so your account can't
                    be impersonated.
                </p>
            </div>
            <form onSubmit={onSubmit} className="grid gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                        id="email"
                        type="email"
                        required
                        autoComplete="email"
                        autoFocus
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                    />
                </div>
                <Button
                    type="submit"
                    variant="gradient"
                    size="lg"
                    className="mt-2"
                    disabled={initiate.isPending || !email}
                >
                    {initiate.isPending ? (
                        <>
                            <Loader2 className="animate-spin" />
                            Sending…
                        </>
                    ) : (
                        "Send verification code"
                    )}
                </Button>
            </form>
            <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to={ROUTES.login} className="text-(--o-emerald) hover:underline">
                    Log in →
                </Link>
            </p>
        </div>
    );
});
