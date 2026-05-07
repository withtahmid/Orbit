import { useState, useRef, type ChangeEvent, type KeyboardEvent } from "react";
import { observer } from "mobx-react-lite";
import { toast } from "sonner";
import { trpc } from "@/trpc";
import { useStore } from "@/stores/useStore";
import { ArrowRight } from "@/pages/auth/AuthShell";

const OTP_LEN = 6;

export const VerifyStep = observer(function VerifyStep() {
    const { signupStore } = useStore();
    const [code, setCode] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const verify = trpc.auth.signup.verify.useMutation({
        onSuccess: (data) => {
            signupStore.setSignupToken(data.token);
            signupStore.setStep(3);
        },
        onError: (e) => toast.error(e.message),
    });

    const resend = trpc.auth.signup.resendCode.useMutation({
        onSuccess: () => {
            toast.success("Code sent again");
            signupStore.startResendCooldown(60);
        },
        onError: (e) => toast.error(e.message),
    });

    const onChange = (e: ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value.replace(/\D/g, "").slice(0, OTP_LEN);
        setCode(next);
        if (next.length === OTP_LEN && signupStore.signupToken) {
            verify.mutate({ code: next, token: signupStore.signupToken });
        }
    };

    const onSubmit = () => {
        if (code.length === OTP_LEN && signupStore.signupToken) {
            verify.mutate({ code, token: signupStore.signupToken });
        }
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
        }
    };

    const cells = Array.from({ length: OTP_LEN }, (_, i) => code[i] ?? "");
    const activeIndex = Math.min(code.length, OTP_LEN - 1);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div
                    className="oa-otp-wrap"
                    onClick={() => inputRef.current?.focus()}
                    role="button"
                    tabIndex={-1}
                >
                    <div className="oa-otp">
                        {cells.map((d, i) => {
                            const isActive = i === activeIndex && code.length < OTP_LEN;
                            const isEmpty = d === "";
                            return (
                                <span
                                    key={i}
                                    className={`oa-otp-cell display tabular ${
                                        isActive ? "is-active" : ""
                                    } ${isEmpty && !isActive ? "is-empty" : ""}`}
                                >
                                    {d || (isActive ? <span className="oa-otp-caret" /> : "")}
                                </span>
                            );
                        })}
                    </div>
                    <input
                        ref={inputRef}
                        className="oa-otp-input"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        value={code}
                        onChange={onChange}
                        onKeyDown={onKeyDown}
                        maxLength={OTP_LEN}
                        aria-label="6-digit verification code"
                    />
                </div>

                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 12,
                        color: "var(--fg-3)",
                    }}
                >
                    <button
                        type="button"
                        onClick={() => signupStore.setStep(1)}
                        className="od-btn od-btn-ghost od-btn-sm"
                        style={{ padding: 0, height: "auto", color: "var(--fg-2)" }}
                    >
                        <svg
                            width="11"
                            height="11"
                            viewBox="0 0 16 16"
                            fill="none"
                        >
                            <path
                                d="M10 4 6 8l4 4"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                        Use a different email
                    </button>
                    {signupStore.resendCooldown > 0 ? (
                        <span>
                            Resend in{" "}
                            <span
                                className="tabular"
                                style={{ color: "var(--fg-2)" }}
                            >
                                0:{String(signupStore.resendCooldown).padStart(2, "0")}
                            </span>
                        </span>
                    ) : (
                        <button
                            type="button"
                            disabled={resend.isPending || !signupStore.signupToken}
                            onClick={() =>
                                signupStore.signupToken &&
                                resend.mutate({ token: signupStore.signupToken })
                            }
                            className="od-btn od-btn-ghost od-btn-sm"
                            style={{
                                padding: 0,
                                height: "auto",
                                color: "var(--brand)",
                            }}
                        >
                            {resend.isPending ? "Sending…" : "Resend code"}
                        </button>
                    )}
                </div>
            </div>

            <button
                type="button"
                onClick={onSubmit}
                disabled={code.length !== OTP_LEN || verify.isPending}
                className="od-btn od-btn-primary od-btn-lg"
                style={{ width: "100%", justifyContent: "center" }}
            >
                {verify.isPending ? "Verifying…" : "Verify & continue"}
                <ArrowRight size={14} color="var(--brand-fg)" />
            </button>
        </div>
    );
});
