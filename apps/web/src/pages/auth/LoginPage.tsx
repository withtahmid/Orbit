import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";

export const LoginPage = observer(() => {
    const { authStore } = useStore();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    // Where to send the user after login (?from= set by ProtectedRoute)
    const redirectTo = searchParams.get("from") ?? ROUTES.dashboard;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        try {
            // 🔌 Replace with your real API / tRPC call:
            // const { token, user } = await trpc.auth.login.mutate({ email, password });
            const token = "mock-jwt-token";
            const user = { id: "1", email, name: "Demo User" };

            authStore.setAuth(token, user);
            navigate(redirectTo, { replace: true });
        } catch {
            setError("Invalid credentials. Please try again.");
        }
    };

    return (
        <div>
            <h1>Sign in</h1>
            {error && <p role="alert">{error}</p>}
            <form onSubmit={handleSubmit}>
                <label>
                    Email
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                    />
                </label>
                <label>
                    Password
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                    />
                </label>
                <button type="submit">Sign in</button>
            </form>
            <p>
                <Link to={ROUTES.forgotPassword}>Forgot password?</Link>
            </p>
            <p>
                No account? <Link to={ROUTES.signup}>Sign up</Link>
            </p>
        </div>
    );
});
