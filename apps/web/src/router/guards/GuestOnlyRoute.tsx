import { Navigate, Outlet, useSearchParams } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";

interface GuestOnlyRouteProps {
    /** Where to send already-authenticated users. Defaults to "/dashboard". */
    redirectTo?: string;
}

/**
 * GuestOnlyRoute
 *
 * The inverse of ProtectedRoute — meant for pages like /login and /signup.
 * If a user is already authenticated, we send them elsewhere.
 * Respects the `?from=` param so the ProtectedRoute redirect chain works end-to-end.
 */
export const GuestOnlyRoute = observer(({ redirectTo = "/dashboard" }: GuestOnlyRouteProps) => {
    const { authStore } = useStore();
    const [searchParams] = useSearchParams();

    if (authStore.isLoading) {
        return null; // or a spinner — avoid flicker
    }

    if (authStore.isAuthenticated) {
        // If we were sent here with a ?from= param, honour it.
        const from = searchParams.get("from");
        return <Navigate to={from ?? redirectTo} replace />;
    }

    return <Outlet />;
});
