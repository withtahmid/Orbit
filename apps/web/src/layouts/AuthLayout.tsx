import { Outlet, Link } from "react-router-dom";
import { ROUTES } from "@/router/routes";

/**
 * AuthLayout
 *
 * Minimal centered layout for authentication pages (login, signup, etc.).
 */
export function AuthLayout() {
    return (
        <div className="auth-layout">
            <header className="auth-layout__header">
                <Link to={ROUTES.home} className="auth-layout__logo">
                    MyApp
                </Link>
            </header>
            <main className="auth-layout__main">
                <Outlet />
            </main>
        </div>
    );
}
