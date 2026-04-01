import { NavLink, Outlet } from "react-router-dom";
import { ROUTES } from "@/router/routes";

/**
 * SettingsPage — /settings
 *
 * Parent of nested settings routes. Renders a sub-nav and an <Outlet />
 * where child routes (general, security, …) will be rendered.
 *
 * Route tree:
 *   /settings             → SettingsGeneralPage  (index route)
 *   /settings/general     → SettingsGeneralPage
 *   /settings/security    → SettingsSecurityPage
 */
export function SettingsPage() {
    return (
        <div>
            <h1>Settings</h1>

            {/* Sub-navigation for nested routes */}
            <nav aria-label="Settings sections">
                <NavLink to={ROUTES.settingsGeneral} end>
                    General
                </NavLink>
                <NavLink to={ROUTES.settingsSecurity}>Security</NavLink>
            </nav>

            {/* Child route renders here */}
            <Outlet />
        </div>
    );
}
