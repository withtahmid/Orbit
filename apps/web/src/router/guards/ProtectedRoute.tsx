import { Navigate, Outlet, useLocation } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";

interface ProtectedRouteProps {
    /** Where to send unauthenticated users. Defaults to "/login". */
    redirectTo?: string;
}

/**
 * ProtectedRoute
 *
 * Reads auth state from the MobX AuthStore.
 * - If loading  → show a spinner (avoids flash-of-redirect on refresh)
 * - If authed   → render children
 * - Otherwise   → redirect to `redirectTo`, preserving `?from=` for post-login redirect
 */
export const ProtectedRoute = observer(({ redirectTo = "/login" }: ProtectedRouteProps) => {
    const { authStore } = useStore();
    const location = useLocation();

    // While the store is rehydrating tokens (e.g. from localStorage),
    // show nothing to avoid a premature redirect.
    if (authStore.isLoading) {
        return <FullPageSpinner />;
    }

    if (!authStore.isAuthenticated) {
        // Preserve the attempted URL so we can redirect back after login.
        return (
            <Navigate
                to={`${redirectTo}?from=${encodeURIComponent(location.pathname + location.search)}`}
                replace
            />
        );
    }

    return <Outlet />;
});

function FullPageSpinner() {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100vh",
            }}
        >
            <span>Loading…</span>
        </div>
    );
}
