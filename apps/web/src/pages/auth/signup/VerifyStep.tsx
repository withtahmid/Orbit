import { useState, useRef, useEffect, useCallback } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";
import { trpc } from "@/trpc";

export const VerifyStep = observer(() => {
    const { signupStore } = useStore();
    const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const verifyCode = trpc.auth.verifyCode.useMutation();
    const resendCode = trpc.auth.resendCode.useMutation();

    // Auto-focus first input on mount
    useEffect(() => {
        inputRefs.current[0]?.focus();
    }, []);

    const handleChange = (index: number, value: string) => {
        // Only allow digits
        if (value && !/^\d$/.test(value)) return;

        const newCode = [...code];
        newCode[index] = value;
        setCode(newCode);
        setError("");

        // Auto-focus next input
        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all 6 digits are filled
        if (value && index === 5 && newCode.every((d) => d !== "")) {
            handleSubmit(newCode.join(""));
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === "Backspace" && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
        if (pastedData.length === 0) return;

        const newCode = [...code];
        for (let i = 0; i < pastedData.length; i++) {
            newCode[i] = pastedData[i]!;
        }
        setCode(newCode);

        // Focus the next empty input or last input
        const nextEmpty = newCode.findIndex((d) => d === "");
        inputRefs.current[nextEmpty === -1 ? 5 : nextEmpty]?.focus();

        // Auto-submit if all filled
        if (newCode.every((d) => d !== "")) {
            handleSubmit(newCode.join(""));
        }
    };

    const handleSubmit = useCallback(async (codeStr?: string) => {
        const fullCode = codeStr || code.join("");
        if (fullCode.length !== 6) return;

        setError("");
        setLoading(true);

        try {
            const result = await verifyCode.mutateAsync({ code: fullCode });
            signupStore.setSignupToken(result.token);
            signupStore.setStep(3);
        } catch (err: any) {
            setError(err.message || "Invalid code. Please try again.");
            // Clear code and refocus
            setCode(["", "", "", "", "", ""]);
            inputRefs.current[0]?.focus();
        } finally {
            setLoading(false);
        }
    }, [code, verifyCode, signupStore]);

    const handleResend = async () => {
        if (signupStore.resendCooldown > 0 || resending) return;
        setResending(true);
        setError("");

        try {
            await resendCode.mutateAsync();
            signupStore.startResendCooldown(60);
        } catch (err: any) {
            setError(err.message || "Failed to resend code.");
        } finally {
            setResending(false);
        }
    };

    return (
        <div className="signup-step signup-step--verify">
            <div className="signup-step__icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <polyline points="9 12 12 15 16 10" />
                </svg>
            </div>
            <h2 className="signup-step__title">Check your email</h2>
            <p className="signup-step__subtitle">
                We sent a 6-digit code to{" "}
                <strong className="signup-step__email-highlight">{signupStore.email}</strong>
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

            <div className="otp-input-group" onPaste={handlePaste}>
                {code.map((digit, index) => (
                    <input
                        key={index}
                        ref={(el) => { inputRefs.current[index] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleChange(index, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(index, e)}
                        className={`otp-input ${digit ? "otp-input--filled" : ""}`}
                        disabled={loading}
                        autoComplete="one-time-code"
                    />
                ))}
            </div>

            {loading && (
                <div className="signup-verifying">
                    <span className="signup-btn__spinner" />
                    Verifying...
                </div>
            )}

            <div className="signup-resend">
                <button
                    type="button"
                    onClick={handleResend}
                    disabled={signupStore.resendCooldown > 0 || resending}
                    className="signup-resend__btn"
                >
                    {resending
                        ? "Sending..."
                        : signupStore.resendCooldown > 0
                          ? `Resend code in ${signupStore.resendCooldown}s`
                          : "Resend code"}
                </button>
            </div>

            <button
                type="button"
                onClick={() => signupStore.setStep(1)}
                className="signup-back-btn"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                </svg>
                Use a different email
            </button>
        </div>
    );
});
