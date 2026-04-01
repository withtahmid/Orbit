import { useEffect } from "react";
import { Link } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";
import { EmailStep } from "./EmailStep";
import { VerifyStep } from "./VerifyStep";
import { PersonalInfoStep } from "./PersonalInfoStep";

export const SignupPage = observer(() => {
    const { signupStore } = useStore();

    // Reset signup state when unmounting (e.g., navigating away)
    useEffect(() => {
        return () => {
            // Don't reset if we're on step 3 — the user might be completing signup
            if (signupStore.step === 1) {
                signupStore.reset();
            }
        };
    }, [signupStore]);

    const stepLabels = ["Email", "Verify", "Details"];

    return (
        <div className="signup-page">
            <div className="signup-card">
                {/* Step indicator */}
                <div className="signup-steps">
                    {stepLabels.map((label, index) => {
                        const stepNum = (index + 1) as 1 | 2 | 3;
                        const isActive = signupStore.step === stepNum;
                        const isCompleted = signupStore.step > stepNum;

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
                    {signupStore.step === 1 && <EmailStep />}
                    {signupStore.step === 2 && <VerifyStep />}
                    {signupStore.step === 3 && <PersonalInfoStep />}
                </div>

                {/* Footer */}
                {signupStore.step === 1 && (
                    <div className="signup-card__footer">
                        Already have an account?{" "}
                        <Link to={ROUTES.login} className="signup-link">
                            Sign in
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
});
