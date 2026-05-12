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
            const rawFrom = searchParams.get("from");
            // Only honor same-origin in-app paths; reject `//host` and
            // anything carrying a protocol so a malicious link can't
            // bounce an authenticated user off-site.
            const from =
                rawFrom &&
                rawFrom.startsWith("/") &&
                !rawFrom.startsWith("//") &&
                !rawFrom.includes("\\")
                    ? rawFrom
                    : null;
            return <Navigate to={from ?? redirectTo} replace />;
        }

        return <Outlet />;
    }
);
