import { Outlet } from "react-router-dom";

/**
 * PublicRoute
 * Accessible by anyone — logged in or not.
 * Currently just renders children, but this is where you'd add
 * things like analytics tracking, public-specific layouts, etc.
 */
export function PublicRoute() {
    return <Outlet />;
}
