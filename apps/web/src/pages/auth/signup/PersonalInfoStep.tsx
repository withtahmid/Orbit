import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/stores/useStore";
import { trpc } from "@/trpc";
import { ROUTES } from "@/router/routes";

export const PersonalInfoStep = observer(() => {
    const { signupStore, authStore } = useStore();
    const navigate = useNavigate();

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const completeSignup = trpc.auth.completeSignup.useMutation();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }

        setLoading(true);

        try {
            const result = await completeSignup.mutateAsync({
                firstName,
                lastName,
                password,
            });

            // Store final auth token and user
            authStore.setAuth(result.token, result.user);

            // Clean up signup state
            signupStore.reset();

            // Navigate to dashboard
            navigate(ROUTES.dashboard, { replace: true });
        } catch (err: any) {
            setError(err.message || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="signup-step signup-step--personal">
            <div className="signup-step__icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                </svg>
            </div>
            <h2 className="signup-step__title">Almost there!</h2>
            <p className="signup-step__subtitle">
                Tell us a bit about yourself to complete your account.
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
                <div className="signup-form__row">
                    <div className="signup-field">
                        <label htmlFor="signup-firstname" className="signup-field__label">
                            First name
                        </label>
                        <input
                            id="signup-firstname"
                            type="text"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder="John"
                            required
                            autoFocus
                            className="signup-field__input"
                        />
                    </div>
                    <div className="signup-field">
                        <label htmlFor="signup-lastname" className="signup-field__label">
                            Last name
                        </label>
                        <input
                            id="signup-lastname"
                            type="text"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder="Doe"
                            required
                            className="signup-field__input"
                        />
                    </div>
                </div>
                <div className="signup-field">
                    <label htmlFor="signup-password" className="signup-field__label">
                        Password
                    </label>
                    <div className="signup-field__password-wrapper">
                        <input
                            id="signup-password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Min. 8 characters"
                            required
                            minLength={8}
                            autoComplete="new-password"
                            className="signup-field__input"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="signup-field__toggle-pw"
                            tabIndex={-1}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                            {showPassword ? (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                    <line x1="1" y1="1" x2="23" y2="23" />
                                </svg>
                            ) : (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
                <div className="signup-field">
                    <label htmlFor="signup-confirm-password" className="signup-field__label">
                        Confirm password
                    </label>
                    <input
                        id="signup-confirm-password"
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter your password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        className="signup-field__input"
                    />
                </div>
                <button
                    type="submit"
                    disabled={loading || !firstName || !lastName || !password || !confirmPassword}
                    className="signup-btn signup-btn--primary"
                >
                    {loading ? (
                        <span className="signup-btn__spinner" />
                    ) : (
                        "Create account"
                    )}
                </button>
            </form>
        </div>
    );
});
