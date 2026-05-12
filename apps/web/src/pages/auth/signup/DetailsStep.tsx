import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { toast } from "sonner";
import { trpc } from "@/trpc";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";
import { ArrowRight } from "@/pages/auth/AuthShell";

export const DetailsStep = observer(function DetailsStep() {
    const { signupStore, authStore } = useStore();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    // Honor `?from=` so an invite link that bounced through /signup
    // delivers the freshly-created user back to /invite/<token>. Apply
    // the same in-app-path guard as the login flow.
    const rawFrom = searchParams.get("from");
    const safeFrom =
        rawFrom &&
        rawFrom.startsWith("/") &&
        !rawFrom.startsWith("//") &&
        !rawFrom.includes("\\")
            ? rawFrom
            : null;
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const complete = trpc.auth.signup.complete.useMutation({
        onSuccess: (data) => {
            authStore.setAuth(data.token, {
                id: data.user.id,
                email: data.user.email,
                name: data.user.name,
            });
            signupStore.reset();
            toast.success("Welcome to Orbit!");
            navigate(safeFrom ?? ROUTES.root, { replace: true });
        },
        onError: (e) => toast.error(e.message),
    });

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (password.length < 8) {
            toast.error("Password must be at least 8 characters");
            return;
        }
        if (password !== confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }
        if (!signupStore.signupToken) {
            toast.error("Session expired. Please restart signup.");
            signupStore.reset();
            signupStore.setStep(1);
            return;
        }
        complete.mutate({
            token: signupStore.signupToken,
            firstName,
            lastName,
            password,
            confirmPassword,
        });
    };

    return (
        <form
            onSubmit={onSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 28 }}
        >
            <div className="oa-fields" style={{ gap: 14 }}>
                <div className="oa-row-2">
                    <label className="oa-field">
                        <span className="oa-field-label">First name</span>
                        <span className="oa-field-input-wrap">
                            <input
                                className="od-input"
                                required
                                autoFocus
                                placeholder="Jane"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                            />
                        </span>
                    </label>
                    <label className="oa-field">
                        <span className="oa-field-label">Last name</span>
                        <span className="oa-field-input-wrap">
                            <input
                                className="od-input"
                                required
                                placeholder="Doe"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                            />
                        </span>
                    </label>
                </div>

                <label className="oa-field">
                    <div className="oa-field-header">
                        <span className="oa-field-label">Password</span>
                        <span className="oa-field-hint">
                            At least 8 characters.
                        </span>
                    </div>
                    <span className="oa-field-input-wrap">
                        <input
                            className="od-input"
                            type="password"
                            required
                            minLength={8}
                            placeholder="••••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </span>
                </label>

                <label className="oa-field">
                    <span className="oa-field-label">Confirm password</span>
                    <span className="oa-field-input-wrap">
                        <input
                            className="od-input"
                            type="password"
                            required
                            minLength={8}
                            placeholder="••••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                    </span>
                </label>
            </div>

            <button
                type="submit"
                className="od-btn od-btn-primary od-btn-lg"
                style={{ width: "100%", justifyContent: "center" }}
                disabled={complete.isPending}
            >
                {complete.isPending ? "Creating account…" : "Create account"}
                <ArrowRight size={14} color="var(--brand-fg)" />
            </button>
        </form>
    );
});
