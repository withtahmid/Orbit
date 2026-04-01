import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";

export const SignupPage = observer(() => {
    const { authStore } = useStore();
    const navigate = useNavigate();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // 🔌 Replace with your real API / tRPC call:
        // const { token, user } = await trpc.auth.signup.mutate({ name, email, password });
        const token = "mock-jwt-token";
        const user = { id: "2", email, name };

        authStore.setAuth(token, user);
        navigate(ROUTES.dashboard, { replace: true });
    };

    return (
        <div>
            <h1>Create account</h1>
            <form onSubmit={handleSubmit}>
                <label>
                    Name
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />
                </label>
                <label>
                    Email
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </label>
                <label>
                    Password
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                    />
                </label>
                <button type="submit">Sign up</button>
            </form>
            <p>
                Already have an account? <Link to={ROUTES.login}>Sign in</Link>
            </p>
        </div>
    );
});
