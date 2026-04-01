import { useState } from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "@/router/routes";

export function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // 🔌 await trpc.auth.forgotPassword.mutate({ email });
        setSent(true);
    };

    if (sent) {
        return (
            <div>
                <h1>Check your inbox</h1>
                <p>We sent a reset link to {email}.</p>
                <Link to={ROUTES.login}>Back to login</Link>
            </div>
        );
    }

    return (
        <div>
            <h1>Forgot password</h1>
            <form onSubmit={handleSubmit}>
                <label>
                    Email
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </label>
                <button type="submit">Send reset link</button>
            </form>
            <Link to={ROUTES.login}>Back to login</Link>
        </div>
    );
}
