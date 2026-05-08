import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Steps } from "@/components/shared/Steps";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";
import { EmailStep } from "./EmailStep";
import { VerifyStep } from "./VerifyStep";
import { NewPasswordStep } from "./NewPasswordStep";

const ForgotPasswordPage = observer(function ForgotPasswordPage() {
    const { forgotPasswordStore } = useStore();
    return (
        <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
            <div
                aria-hidden
                className="pointer-events-none absolute -top-40 -right-40 size-[500px] rounded-full blur-3xl"
                style={{
                    background: "radial-gradient(closest-side, var(--primary), transparent 70%)",
                    opacity: 0.28,
                }}
            />
            <div
                aria-hidden
                className="pointer-events-none absolute -bottom-40 -left-40 size-[520px] rounded-full blur-3xl"
                style={{
                    background: "radial-gradient(closest-side, var(--accent), transparent 70%)",
                    opacity: 0.24,
                }}
            />

            <header className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-6 py-5">
                <Link to={ROUTES.root} className="text-xl font-bold tracking-tight text-gradient-brand">
                    Orbit
                </Link>
                <Link
                    to={ROUTES.docs}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <BookOpen className="size-3.5" />
                    Docs
                </Link>
            </header>

            <main className="relative z-10 w-full max-w-md">
                <Card className="border-border/60 shadow-2xl">
                    <div className="pt-6">
                        <Steps
                            current={forgotPasswordStore.step}
                            total={3}
                            labels={["Email", "Verify", "New password"]}
                        />
                    </div>
                    <CardContent>
                        {forgotPasswordStore.step === 1 && <EmailStep />}
                        {forgotPasswordStore.step === 2 && <VerifyStep />}
                        {forgotPasswordStore.step === 3 && <NewPasswordStep />}
                    </CardContent>
                </Card>
            </main>

            <footer className="relative z-10 mt-8 text-xs text-muted-foreground">
                Personal finance, made collaborative.
            </footer>
        </div>
    );
});

export default ForgotPasswordPage;
