import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/router/routes";

/**
 * useAppNavigate
 *
 * Typed wrappers around useNavigate() so you never hardcode paths in components.
 *
 * Usage:
 *   const nav = useAppNavigate();
 *   nav.toUserDetail("42");
 *   nav.toSearch({ q: "hello", page: "2" });
 *   nav.toDashboard();
 */
export function useAppNavigate() {
    const navigate = useNavigate();

    return {
        toHome: () => navigate(ROUTES.home),
        toDashboard: () => navigate(ROUTES.dashboard),
        toProfile: () => navigate(ROUTES.profile),
        toLogin: (from?: string) =>
            navigate(from ? `${ROUTES.login}?from=${encodeURIComponent(from)}` : ROUTES.login),
        toSignup: () => navigate(ROUTES.signup),
        toUserDetail: (userId: string) => navigate(ROUTES.userDetail(userId)),
        toSearch: (params?: { q?: string; page?: string }) =>
            navigate(params ? ROUTES.searchWithQuery(params) : ROUTES.search),
        toSettings: () => navigate(ROUTES.settingsGeneral),
        toSettingsSecurity: () => navigate(ROUTES.settingsSecurity),
        back: () => navigate(-1),
    };
}
