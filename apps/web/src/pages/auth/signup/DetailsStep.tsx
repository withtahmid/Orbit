import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { Loader2, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/trpc";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";

export const DetailsStep = observer(function DetailsStep() {
    const { signupStore, authStore } = useStore();
    const navigate = useNavigate();
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const complete = trpc.auth.signup.complete.useMutation({
        onSuccess: (data) => {
            authStore.setAuth(data.token, {
                id: data.user.id,
                email: data.user.email,
                name: data.user.name,
            });
            signupStore.reset();
            toast.success("Welcome to Orbit!");
            navigate(ROUTES.root, { replace: true });
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
        if (!signupStore.signupToken) {
            toast.error("Session expired. Please restart signup.");
            signupStore.reset();
            signupStore.setStep(1);
            return;
        }
        complete.mutate({
            token: signupStore.signupToken,
            firstName,
            lastName,
            password,
            confirmPassword,
        });
    };

    return (
        <div className="grid gap-6">
            <div>
                <p className="o-eyebrow mb-3 flex items-center gap-2">
                    <User className="size-3.5" />
                    <span>Almost there</span>
                </p>
                <h1 className="o-page-title">Tell us who you are.</h1>
                <p className="o-page-sub mt-3">
                    Your name and a password. This is the account you'll own across every
                    space.
                </p>
            </div>
            <form onSubmit={onSubmit} className="grid gap-4">
                <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                        <Label htmlFor="first">First name</Label>
                        <Input
                            id="first"
                            required
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder="Jane"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="last">Last name</Label>
                        <Input
                            id="last"
                            required
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder="Doe"
                        />
                    </div>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="pw">Password</Label>
                    <Input
                        id="pw"
                        type="password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="pwc">Confirm password</Label>
                    <Input
                        id="pwc"
                        type="password"
                        required
                        minLength={8}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                </div>
                <Button
                    type="submit"
                    variant="gradient"
                    size="lg"
                    className="mt-2"
                    disabled={complete.isPending}
                >
                    {complete.isPending ? (
                        <>
                            <Loader2 className="animate-spin" />
                            Creating your account…
                        </>
                    ) : (
                        "Create account"
                    )}
                </Button>
            </form>
        </div>
    );
});
