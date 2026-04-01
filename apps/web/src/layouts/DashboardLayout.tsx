import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";

/**
 * DashboardLayout
 *
 * Sidebar + top-bar shell for all protected pages.
 * Uses NavLink so active route gets an `active` class automatically.
 */
export const DashboardLayout = observer(() => {
    const { authStore } = useStore();
    const navigate = useNavigate();

    const handleLogout = () => {
        authStore.clearAuth();
        navigate(ROUTES.login);
    };

    return (
        <div className="dashboard-layout">
            <aside className="dashboard-layout__sidebar">
                <nav>
                    <NavLink to={ROUTES.dashboard}>Dashboard</NavLink>
                    <NavLink to={ROUTES.profile}>Profile</NavLink>
                    <NavLink to={ROUTES.settingsGeneral}>Settings</NavLink>
                    <NavLink to={ROUTES.searchWithQuery({ q: "" })}>Search</NavLink>
                </nav>
                <button onClick={handleLogout}>Log out</button>
            </aside>

            <div className="dashboard-layout__content">
                <Outlet />
            </div>
        </div>
    );
});
