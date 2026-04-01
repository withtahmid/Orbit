import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";
import { trpc } from "@/trpc";

export const EmailStep = observer(() => {
    const { forgotPasswordStore } = useStore();
    const [email, setEmail] = useState(forgotPasswordStore.email || "");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const initiatePasswordReset = trpc.auth.initiatePasswordReset.useMutation();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const result = await initiatePasswordReset.mutateAsync({ email });
            forgotPasswordStore.setEmail(email);
            // Even if unverified, proceed to the next step
            if (result.token) {
                forgotPasswordStore.setResetToken(result.token);
            }
            forgotPasswordStore.startResendCooldown(60);
            forgotPasswordStore.setStep(2);
        } catch (err: any) {
            setError(err.message || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="signup-step signup-step--email">
            <div className="signup-step__icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M22 4L12 13L2 4" />
                </svg>
            </div>
            <h2 className="signup-step__title">Reset your password</h2>
            <p className="signup-step__subtitle">
                Enter your email address to receive a verification code.
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
                    <label htmlFor="forgot-email" className="signup-field__label">
                        Email address
                    </label>
                    <input
                        id="forgot-email"
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
                <button
                    type="submit"
                    disabled={loading || !email}
                    className="signup-btn signup-btn--primary"
                >
                    {loading ? (
                        <span className="signup-btn__spinner" />
                    ) : (
                        "Send reset code"
                    )}
                </button>
            </form>
        </div>
    );
});
