import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { toast } from "sonner";
import { trpc } from "@/trpc";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";
import { ArrowRight } from "@/pages/auth/AuthShell";

export const EmailStep = observer(function EmailStep() {
    const { signupStore } = useStore();
    const [email, setEmail] = useState(signupStore.email || "");
    const [agreed, setAgreed] = useState(true);

    const initiate = trpc.auth.signup.initiate.useMutation({
        onSuccess: (data) => {
            signupStore.setEmail(email);
            signupStore.setSignupToken(data.token);
            signupStore.setStep(2);
            signupStore.startResendCooldown(60);
            toast.success("Verification code sent");
        },
        onError: (e) => toast.error(e.message),
    });

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!agreed) {
            toast.error("Please agree to the Terms and Privacy Policy");
            return;
        }
        initiate.mutate({ email });
    };

    return (
        <form
            onSubmit={onSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 28 }}
        >
            <div className="oa-fields" style={{ gap: 14 }}>
                <label className="oa-field">
                    <div className="oa-field-header">
                        <span className="oa-field-label">Email</span>
                        <span className="oa-field-hint">
                            We&apos;ll never share this. Used for sign-in only.
                        </span>
                    </div>
                    <span className="oa-field-input-wrap">
                        <input
                            className="od-input"
                            type="email"
                            required
                            autoComplete="email"
                            autoFocus
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </span>
                </label>

                <label
                    style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "flex-start",
                        fontSize: 12,
                        color: "var(--fg-3)",
                        lineHeight: 1.5,
                        marginTop: 2,
                        cursor: "pointer",
                    }}
                >
                    <input
                        type="checkbox"
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                        style={{
                            position: "absolute",
                            opacity: 0,
                            pointerEvents: "none",
                        }}
                        aria-label="Agree to terms"
                    />
                    <span
                        style={{
                            width: 14,
                            height: 14,
                            marginTop: 2,
                            borderRadius: 4,
                            background: agreed
                                ? "var(--brand)"
                                : "var(--bg-elev-2)",
                            border: agreed
                                ? "1px solid var(--brand)"
                                : "1px solid var(--line)",
                            display: "grid",
                            placeItems: "center",
                            flexShrink: 0,
                            transition: "all 140ms ease",
                        }}
                    >
                        {agreed && (
                            <svg
                                width="9"
                                height="9"
                                viewBox="0 0 12 12"
                                fill="none"
                            >
                                <path
                                    d="M2.5 6l2.5 2.5L9.5 3.5"
                                    stroke="var(--brand-fg)"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        )}
                    </span>
                    <span>
                        I agree to the Terms and Privacy Policy.
                    </span>
                </label>
            </div>

            <button
                type="submit"
                className="od-btn od-btn-primary od-btn-lg"
                style={{ width: "100%", justifyContent: "center" }}
                disabled={initiate.isPending || !email}
            >
                {initiate.isPending ? "Sending…" : "Send code"}
                <ArrowRight size={14} color="var(--brand-fg)" />
            </button>

            <div
                style={{
                    textAlign: "center",
                    fontSize: 12.5,
                    color: "var(--fg-3)",
                    marginTop: -8,
                }}
            >
                Already have an account?{" "}
                <Link
                    to={ROUTES.login}
                    style={{
                        color: "var(--fg)",
                        borderBottom: "1px solid var(--line)",
                        textDecoration: "none",
                    }}
                >
                    Sign in
                </Link>
            </div>
        </form>
    );
});
