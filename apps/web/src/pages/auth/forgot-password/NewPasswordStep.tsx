import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";
import { trpc } from "@/trpc";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/router/routes";

export const NewPasswordStep = observer(() => {
    const { forgotPasswordStore } = useStore();
    const navigate = useNavigate();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const completeReset = trpc.auth.resetPassword.complete.useMutation();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);

        try {
            if (!forgotPasswordStore.resetToken) {
                setError("Your reset session expired. Please restart from email step.");
                forgotPasswordStore.setStep(1);
                setLoading(false);
                return;
            }

            await completeReset.mutateAsync({
                token: forgotPasswordStore.resetToken,
                password,
                confirmPassword,
            });
            setSuccess(true);
            forgotPasswordStore.reset();
            // Redirect smoothly to login
            setTimeout(() => {
                navigate(ROUTES.login);
            }, 3000);
        } catch (err: any) {
            setError(err.message || "Failed to reset password. Please try again.");
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="signup-step">
                <div
                    className="signup-step__icon"
                    style={{
                        background: "rgba(34, 197, 94, 0.1)",
                        color: "#22c55e",
                        borderColor: "rgba(34, 197, 94, 0.2)",
                    }}
                >
                    <svg
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                </div>
                <h2 className="signup-step__title">Password Reset</h2>
                <p className="signup-step__subtitle" style={{ color: "#22c55e" }}>
                    Your password has been successfully reset.
                </p>
                <p className="signup-step__subtitle" style={{ fontSize: "14px" }}>
                    Redirecting you to login...
                </p>
            </div>
        );
    }

    return (
        <div className="signup-step signup-step--details">
            <div className="signup-step__icon">
                <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
            </div>
            <h2 className="signup-step__title">Create new password</h2>
            <p className="signup-step__subtitle">Please enter your new password below.</p>

            {error && (
                <div className="signup-alert signup-alert--error" role="alert">
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="signup-form">
                <div className="signup-field">
                    <label htmlFor="new-password" className="signup-field__label">
                        New Password
                    </label>
                    <div className="signup-field__password-wrapper">
                        <input
                            id="new-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="At least 8 characters"
                            required
                            minLength={8}
                            className="signup-field__input"
                        />
                    </div>
                </div>

                <div className="signup-field">
                    <label htmlFor="confirm-password" className="signup-field__label">
                        Confirm Password
                    </label>
                    <div className="signup-field__password-wrapper">
                        <input
                            id="confirm-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Type password again"
                            required
                            minLength={8}
                            className="signup-field__input"
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading || !password || !confirmPassword}
                    className="signup-btn signup-btn--primary"
                >
                    {loading ? <span className="signup-btn__spinner" /> : "Reset Password"}
                </button>
            </form>
        </div>
    );
});
