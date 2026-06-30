import { Navigate, useParams } from "react-router-dom";
import { ROUTES } from "@/router/routes";
import type { CockpitTab } from "@/hooks/useCockpitState";

/**
 * Redirects a legacy per-view analytics route (e.g. /analytics/cash-flow)
 * to the cockpit with the matching tab pre-selected. Keeps old bookmarks
 * and shared links working after the 10 routes were folded into one.
 */
export function RedirectToTab({ tab }: { tab: CockpitTab }) {
    const { spaceId } = useParams();
    const base = ROUTES.spaceAnalytics(spaceId ?? "");
    return <Navigate to={tab === "overview" ? base : `${base}?tab=${tab}`} replace />;
}
