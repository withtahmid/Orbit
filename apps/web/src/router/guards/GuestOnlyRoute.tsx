import { Navigate, Outlet, useSearchParams } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";
import { FullPageSpinner } from "@/components/shared/LoadingScreen";

export const GuestOnlyRoute = observer(
    ({ redirectTo = "/" }: { redirectTo?: string }) => {
        const { authStore } = useStore();
        const [searchParams] = useSearchParams();

        if (authStore.isLoading) return <FullPageSpinner />;

        if (authStore.isAuthenticated) {
            const from = searchParams.get("from");
            return <Navigate to={from ?? redirectTo} replace />;
        }

        return <Outlet />;
    }
);
