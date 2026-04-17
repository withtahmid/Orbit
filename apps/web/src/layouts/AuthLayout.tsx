import { Outlet } from "react-router-dom";

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

            <header className="absolute left-6 top-6 z-10">
                <div className="text-xl font-bold tracking-tight text-gradient-brand">Orbit</div>
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
