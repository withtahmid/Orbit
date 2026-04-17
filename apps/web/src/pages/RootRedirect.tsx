import { observer } from "mobx-react-lite";
import { Navigate } from "react-router-dom";
import { useStore } from "@/stores/useStore";
import { trpc } from "@/trpc";
import { FullPageSpinner } from "@/components/shared/LoadingScreen";
import { LAST_SPACE_KEY } from "@/providers/CurrentSpaceProvider";
import { ROUTES } from "@/router/routes";

export const RootRedirect = observer(function RootRedirect() {
    const { authStore } = useStore();

    if (authStore.isLoading) return <FullPageSpinner />;
    if (!authStore.isAuthenticated) return <Navigate to={ROUTES.login} replace />;

    return <AuthenticatedRedirect />;
});

function AuthenticatedRedirect() {
    const spacesQuery = trpc.space.list.useQuery();
    if (spacesQuery.isLoading) return <FullPageSpinner />;
    const spaces = spacesQuery.data ?? [];
    const last = localStorage.getItem(LAST_SPACE_KEY);
    if (last && spaces.some((s) => s.id === last)) {
        return <Navigate to={ROUTES.space(last)} replace />;
    }
    if (spaces.length > 0) {
        return <Navigate to={ROUTES.space(spaces[0].id)} replace />;
    }
    return <Navigate to={ROUTES.spaces} replace />;
}
