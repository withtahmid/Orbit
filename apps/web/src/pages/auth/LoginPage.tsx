import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";
import { trpc } from "@/trpc";

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
            authStore.setAuth(token, user);
            navigate(redirectTo, { replace: true });
        } catch (err: any) {
            setError(err.message || "Invalid credentials. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="signup-page">
            <div className="signup-card">
                <div className="signup-card__content">
                    <div className="signup-step">
                        <div className="signup-step__icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                <polyline points="10 17 15 12 10 7" />
                                <line x1="15" y1="12" x2="3" y2="12" />
                            </svg>
                        </div>
                        <h2 className="signup-step__title">Welcome back</h2>
                        <p className="signup-step__subtitle">
                            Sign in to your account to continue
                        </p>

                        {error && (
                            <div className="signup-alert signup-alert--error" role="alert">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="15" y1="9" x2="9" y2="15" />
                                    <line x1="9" y1="9" x2="15" y2="15" />
                                </svg>
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="signup-form">
                            <div className="signup-field">
                                <label htmlFor="login-email" className="signup-field__label">
                                    Email address
                                </label>
                                <input
                                    id="login-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    required
                                    autoComplete="email"
                                    autoFocus
                                    className="signup-field__input"
                                />
                            </div>
                            
                            <div className="signup-field">
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <label htmlFor="login-password" className="signup-field__label">
                                        Password
                                    </label>
                                    <Link to={ROUTES.forgotPassword} className="signup-link" style={{ fontSize: "13px" }}>
                                        Forgot password?
                                    </Link>
                                </div>
                                <div className="signup-field__password-wrapper">
                                    <input
                                        id="login-password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        autoComplete="current-password"
                                        className="signup-field__input"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !email || !password}
                                className="signup-btn signup-btn--primary"
                                style={{ marginTop: "10px" }}
                            >
                                {loading ? (
                                    <span className="signup-btn__spinner" />
                                ) : (
                                    "Sign in"
                                )}
                            </button>
                        </form>
                    </div>
                </div>

                <div className="signup-card__footer">
                    Don't have an account yet?{" "}
                    <Link to={ROUTES.signup} className="signup-link">
                        Sign up
                    </Link>
                </div>
            </div>
        </div>
    );
});
