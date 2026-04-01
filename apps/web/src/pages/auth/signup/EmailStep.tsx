import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";
import { trpc } from "@/trpc";

export const EmailStep = observer(() => {
    const { signupStore } = useStore();
    const [email, setEmail] = useState(signupStore.email || "");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const initiateSignup = trpc.auth.initiateSignup.useMutation();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const result = await initiateSignup.mutateAsync({ email });
            signupStore.setEmail(email);
            signupStore.setSignupToken(result.token);
            signupStore.startResendCooldown(60);
            signupStore.setStep(2);
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
            <h2 className="signup-step__title">What's your email?</h2>
            <p className="signup-step__subtitle">
                We'll send a verification code to confirm it's you.
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
                    <label htmlFor="signup-email" className="signup-field__label">
                        Email address
                    </label>
                    <input
                        id="signup-email"
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
                        "Continue"
                    )}
                </button>
            </form>
        </div>
    );
});
