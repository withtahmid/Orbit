import { Link } from "react-router-dom";
import { ROUTES } from "@/router/routes";

export function HomePage() {
    return (
        <main>
            <h1>Welcome to MyApp</h1>
            <p>The landing page — accessible by everyone.</p>
            <Link to={ROUTES.login}>Get Started</Link>
        </main>
    );
}
