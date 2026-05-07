import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";
import { AuthShell, AuthFormHeader } from "@/pages/auth/AuthShell";
import { EmailStep } from "./EmailStep";
import { VerifyStep } from "./VerifyStep";
import { DetailsStep } from "./DetailsStep";

const TITLES = ["What's your email?", "Check your inbox", "Almost there"];

const SUBS_FOR_STEP = (step: 1 | 2 | 3, email: string) =>
    [
        "We'll send a 6-digit code to verify it's really you. No password yet.",
        `Enter the 6-digit code we sent to ${email || "your email"}.`,
        "Tell us a bit about you and choose a password.",
    ][step - 1];

const SignupPage = observer(function SignupPage() {
    const { signupStore } = useStore();
    const step = signupStore.step;

    return (
        <AuthShell side="left">
            <div className="oa-form-inner">
                <div>
                    <div className="oa-progress" aria-hidden>
                        {[1, 2, 3].map((n) => (
                            <span
                                key={n}
                                className={n <= step ? "is-active" : ""}
                            />
                        ))}
                    </div>
                    <AuthFormHeader
                        eyebrow={
                            <>
                                Step {step} of 3 ·{" "}
                                {step === 1
                                    ? "Email"
                                    : step === 2
                                      ? "Verify"
                                      : "Details"}
                            </>
                        }
                        title={TITLES[step - 1]}
                        description={SUBS_FOR_STEP(step, signupStore.email)}
                    />
                </div>

                {step === 1 && <EmailStep />}
                {step === 2 && <VerifyStep />}
                {step === 3 && <DetailsStep />}
            </div>
        </AuthShell>
    );
});

export default SignupPage;
