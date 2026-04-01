import { useEffect } from "react";
import { Link } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";
import { EmailStep } from "./EmailStep";
import { VerifyStep } from "./VerifyStep";
import { NewPasswordStep } from "./NewPasswordStep";

export const ForgotPasswordPage = observer(() => {
    const { forgotPasswordStore } = useStore();

    // Reset state when unmounting from the email step
    useEffect(() => {
        return () => {
            if (forgotPasswordStore.step === 1) {
                forgotPasswordStore.reset();
            }
        };
    }, [forgotPasswordStore]);

    const stepLabels = ["Email", "Verify", "New Password"];

    return (
        <div className="signup-page">
            <div className="signup-card">
                {/* Step indicator */}
                <div className="signup-steps">
                    {stepLabels.map((label, index) => {
                        const stepNum = (index + 1) as 1 | 2 | 3;
                        const isActive = forgotPasswordStore.step === stepNum;
                        const isCompleted = forgotPasswordStore.step > stepNum;

                        return (
                            <div
                                key={label}
                                className={`signup-steps__item ${isActive ? "signup-steps__item--active" : ""} ${isCompleted ? "signup-steps__item--completed" : ""}`}
                            >
                                <div className="signup-steps__circle">
                                    {isCompleted ? (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    ) : (
                                        stepNum
                                    )}
                                </div>
                                <span className="signup-steps__label">{label}</span>
                                {index < stepLabels.length - 1 && (
                                    <div className={`signup-steps__connector ${isCompleted ? "signup-steps__connector--completed" : ""}`} />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Step content */}
                <div className="signup-card__content">
                    {forgotPasswordStore.step === 1 && <EmailStep />}
                    {forgotPasswordStore.step === 2 && <VerifyStep />}
                    {forgotPasswordStore.step === 3 && <NewPasswordStep />}
                </div>

                {/* Footer */}
                {(forgotPasswordStore.step === 1 || forgotPasswordStore.step === 2) && (
                    <div className="signup-card__footer">
                        Remembered your password?{" "}
                        <Link to={ROUTES.login} className="signup-link">
                            Sign in
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
});
