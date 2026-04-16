import { Outlet, Link } from "react-router-dom";
import { ROUTES } from "@/router/routes";

/**
 * AuthLayout
 *
 * Minimal centered layout for authentication pages (login, signup, etc.).
 */
export function AuthLayout() {
    return (
        <div className="auth-layout relative min-h-screen overflow-hidden bg-background">
            <header className="auth-layout__header z-10 flex w-full items-center justify-between px-6 py-6 lg:px-10">
                <Link
                    to={ROUTES.login}
                    className="auth-layout__logo text-lg font-semibold tracking-tight"
                >
                    Orbit Finance
                </Link>
                <p className="hidden text-sm text-muted-foreground md:block">
                    Collaborative budgeting for modern spaces
                </p>
            </header>
            <main className="auth-layout__main relative z-10 mx-auto w-full max-w-xl px-6 pb-12 lg:px-0">
                <Outlet />
            </main>
        </div>
    );
}
