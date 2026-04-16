import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";
import { trpc } from "@/trpc";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const LoginPage = observer(() => {
    const { authStore } = useStore();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const loginMutation = trpc.auth.login.useMutation();

    // Where to send the user after login (?from= set by ProtectedRoute)
    const redirectTo = searchParams.get("from") ?? ROUTES.dashboard;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const { token, user } = await loginMutation.mutateAsync({ email, password });
            authStore.setAuth(token, {
                id: user.id,
                email: user.email,
                name: `${user.firstName} ${user.lastName}`,
                avatarUrl: user.avatar_url ?? undefined,
            });
            navigate(redirectTo, { replace: true });
        } catch (err: any) {
            setError(err.message || "Invalid credentials. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="signup-page">
            <Card className="signup-card border-border/80 bg-card/90 backdrop-blur">
                <CardHeader className="space-y-2 text-center">
                    <CardTitle className="text-2xl">Welcome back</CardTitle>
                    <CardDescription>Sign in to continue to your workspace</CardDescription>
                </CardHeader>
                <CardContent>
                    {error && (
                        <div className="signup-alert signup-alert--error mb-4" role="alert">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="signup-form">
                        <div className="signup-field">
                            <label htmlFor="login-email" className="signup-field__label">
                                Email address
                            </label>
                            <Input
                                id="login-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                                autoComplete="email"
                                autoFocus
                            />
                        </div>

                        <div className="signup-field">
                            <div className="flex items-center justify-between">
                                <label htmlFor="login-password" className="signup-field__label">
                                    Password
                                </label>
                                <Link to={ROUTES.forgotPassword} className="signup-link text-xs">
                                    Forgot password?
                                </Link>
                            </div>
                            <Input
                                id="login-password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your password"
                                required
                                autoComplete="current-password"
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={loading || !email || !password}
                            className="w-full"
                        >
                            {loading ? "Signing in..." : "Sign in"}
                        </Button>
                    </form>
                </CardContent>

                <CardFooter className="justify-center border-t border-border/70 text-sm text-muted-foreground">
                    Don&apos;t have an account yet?&nbsp;
                    <Link to={ROUTES.signup} className="signup-link">
                        Sign up
                    </Link>
                </CardFooter>
            </Card>
        </div>
    );
});
