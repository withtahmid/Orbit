import { Link, useLocation } from "react-router-dom";
import { ROUTES } from "@/router/routes";

export function NotFoundPage() {
    const location = useLocation();

    return (
        <main>
            <h1>404 — Page not found</h1>
            <p>
                <code>{location.pathname}</code> does not exist.
            </p>
            <Link to={ROUTES.home}>Go home</Link>
        </main>
    );
}
