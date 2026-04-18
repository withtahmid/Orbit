import { Link, Outlet } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { ROUTES } from "@/router/routes";

export function AuthLayout() {
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
                <div className="text-xl font-bold tracking-tight text-gradient-brand">
                    Orbit
                </div>
                <Link
                    to={ROUTES.docs}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <BookOpen className="size-3.5" />
                    Docs
                </Link>
            </header>

            <main className="relative z-10 w-full max-w-md">
                <Outlet />
            </main>

            <footer className="relative z-10 mt-8 text-xs text-muted-foreground">
                Personal finance, made collaborative.
            </footer>
        </div>
    );
}
