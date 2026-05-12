import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { toast } from "sonner";
import { trpc } from "@/trpc";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";
import { IS_DEMO } from "@/config/isDemo";
import { AuthShell, AuthFormHeader, ArrowRight } from "./AuthShell";

const DEMO_EMAIL = "alex@orbit.dev";
const DEMO_PASSWORD = "password123";

export const LoginPage = observer(function LoginPage() {
    const { authStore } = useStore();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    // Only honor `?from=` if it's an in-app, same-origin path. Anything
    // starting with `//` or containing a protocol could redirect a
    // freshly-authenticated user to a phishing page.
    const rawFrom = searchParams.get("from");
    const from =
        rawFrom &&
        rawFrom.startsWith("/") &&
        !rawFrom.startsWith("//") &&
        !rawFrom.includes("\\")
            ? rawFrom
            : null;
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
                avatarFileId: data.user.avatar_file_id ?? undefined,
            });
            toast.success("Welcome back!");
            navigate(from ?? ROUTES.root, { replace: true });
        },
        onError: (e) => toast.error(e.message),
    });

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        login.mutate({ email, password });
    };

    const fillDemo = () => {
        setEmail(DEMO_EMAIL);
        setPassword(DEMO_PASSWORD);
    };

    return (
        <AuthShell side="right">
            <form className="oa-form-inner" onSubmit={onSubmit}>
                <AuthFormHeader
                    eyebrow="Sign in"
                    title="Welcome back"
                    description="Pick up where you left off."
                />

                {IS_DEMO && (
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid color-mix(in oklab, var(--gold) 35%, var(--line))",
                            background: "var(--gold-soft)",
                        }}
                    >
                        <div style={{ minWidth: 0 }}>
                            <div
                                style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: "var(--gold)",
                                    letterSpacing: "0.04em",
                                    textTransform: "uppercase",
                                }}
                            >
                                Demo credentials
                            </div>
                            <div
                                className="mono"
                                style={{
                                    fontSize: 12.5,
                                    color: "var(--fg-2)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                <span style={{ userSelect: "all" }}>{DEMO_EMAIL}</span>
                                <span style={{ margin: "0 6px", opacity: 0.5 }}>·</span>
                                <span style={{ userSelect: "all" }}>{DEMO_PASSWORD}</span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={fillDemo}
                            className="od-btn od-btn-sm"
                        >
                            Fill
                        </button>
                    </div>
                )}

                <div className="oa-fields">
                    <label className="oa-field">
                        <span className="oa-field-label">Email</span>
                        <span className="oa-field-input-wrap">
                            <input
                                className="od-input"
                                type="email"
                                required
                                autoComplete="email"
                                autoFocus
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </span>
                    </label>

                    <label className="oa-field">
                        <div className="oa-field-header">
                            <span className="oa-field-label">Password</span>
                            <Link
                                to={ROUTES.forgotPassword}
                                className="oa-field-hint-action"
                            >
                                Forgot password?
                            </Link>
                        </div>
                        <span className="oa-field-input-wrap">
                            <input
                                className="od-input"
                                type={showPassword ? "text" : "password"}
                                required
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{ paddingRight: 44 }}
                            />
                            <button
                                type="button"
                                className="oa-field-toggle"
                                onClick={() => setShowPassword((s) => !s)}
                                aria-label={
                                    showPassword
                                        ? "Hide password"
                                        : "Show password"
                                }
                            >
                                {showPassword ? (
                                    <EyeOffIcon />
                                ) : (
                                    <EyeIcon />
                                )}
                            </button>
                        </span>
                    </label>
                </div>

                <button
                    type="submit"
                    className="od-btn od-btn-primary od-btn-lg"
                    style={{ width: "100%", justifyContent: "center" }}
                    disabled={login.isPending}
                >
                    {login.isPending ? "Signing in…" : "Continue"}
                    <ArrowRight size={14} color="var(--brand-fg)" />
                </button>

                <div
                    style={{
                        textAlign: "center",
                        fontSize: 12.5,
                        color: "var(--fg-3)",
                    }}
                >
                    New to Orbit?{" "}
                    <Link
                        to={ROUTES.signup}
                        style={{
                            color: "var(--fg)",
                            borderBottom: "1px solid var(--line)",
                            textDecoration: "none",
                        }}
                    >
                        Create account
                    </Link>
                </div>
            </form>
        </AuthShell>
    );
});

const EyeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
            d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={1.6} />
    </svg>
);

const EyeOffIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
            d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.5 17.5 0 0 1-3.2 4.1M6.6 6.6A17.6 17.6 0 0 0 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);
