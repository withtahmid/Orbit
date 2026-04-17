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
        <div className="grid gap-5 py-2 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-brand-gradient-to/20 text-primary">
                <Mail className="size-6" />
            </div>
            <div>
                <h2 className="text-xl font-bold">Create your account</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Enter your email to get a verification code
                </p>
            </div>
            <form onSubmit={onSubmit} className="grid gap-3 text-left">
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
                        "Send verification code"
                    )}
                </Button>
            </form>
            <p className="text-xs text-muted-foreground">
                Already have an account?{" "}
                <Link to={ROUTES.login} className="text-primary hover:underline">
                    Log in
                </Link>
            </p>
        </div>
    );
});
