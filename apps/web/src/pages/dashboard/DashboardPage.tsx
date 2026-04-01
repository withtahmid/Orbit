import { observer } from "mobx-react-lite";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";

export const DashboardPage = observer(() => {
    const { authStore } = useStore();
    const navigate = useNavigate();

    return (
        <div>
            <h1>Dashboard</h1>
            <p>Welcome back, {authStore.user?.name}!</p>

            {/* Navigate to a route with a URL param */}
            <button onClick={() => navigate(ROUTES.userDetail("42"))}>View User #42</button>

            {/* Navigate to a route with query params */}
            <Link to={ROUTES.searchWithQuery({ q: "react router", page: "1" })}>
                Search "react router"
            </Link>
        </div>
    );
});
