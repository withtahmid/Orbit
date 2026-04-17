import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/trpc";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";

export const LoginPage = observer(function LoginPage() {
    const { authStore } = useStore();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const login = trpc.auth.login.useMutation({
        onSuccess: (data) => {
            const name = `${data.user.firstName} ${data.user.lastName}`.trim();
            authStore.setAuth(data.token, {
                id: data.user.id,
                email: data.user.email,
                name,
                avatarUrl: data.user.avatar_url ?? undefined,
            });
            toast.success("Welcome back!");
            navigate(ROUTES.root, { replace: true });
        },
        onError: (e) => toast.error(e.message),
    });

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        login.mutate({ email, password });
    };

    return (
        <Card className="border-border/60 shadow-2xl">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">Welcome back</CardTitle>
                <CardDescription>Sign in to continue to your spaces</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={onSubmit} className="grid gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            required
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                        />
                    </div>
                    <div className="grid gap-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="password">Password</Label>
                            <Link
                                to={ROUTES.forgotPassword}
                                className="text-xs text-primary hover:underline"
                            >
                                Forgot?
                            </Link>
                        </div>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                required
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((s) => !s)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                aria-label="Toggle password visibility"
                            >
                                {showPassword ? (
                                    <EyeOff className="size-4" />
                                ) : (
                                    <Eye className="size-4" />
                                )}
                            </button>
                        </div>
                    </div>
                    <Button
                        type="submit"
                        variant="gradient"
                        className="mt-1"
                        disabled={login.isPending}
                    >
                        {login.isPending ? (
                            <>
                                <Loader2 className="animate-spin" />
                                Signing in…
                            </>
                        ) : (
                            "Sign in"
                        )}
                    </Button>
                </form>
                <p className="mt-6 text-center text-sm text-muted-foreground">
                    Don&apos;t have an account?{" "}
                    <Link to={ROUTES.signup} className="text-primary hover:underline">
                        Create one
                    </Link>
                </p>
            </CardContent>
        </Card>
    );
});
