import { Navigate, Outlet, useLocation } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";
import { FullPageSpinner } from "@/components/shared/LoadingScreen";

export const ProtectedRoute = observer(
    ({ redirectTo = "/login" }: { redirectTo?: string }) => {
        const { authStore } = useStore();
        const location = useLocation();

        if (authStore.isLoading) return <FullPageSpinner />;

        if (!authStore.isAuthenticated) {
            const target = `${redirectTo}?from=${encodeURIComponent(
                location.pathname + location.search
            )}`;
            return <Navigate to={target} replace />;
        }

        return <Outlet />;
    }
);
