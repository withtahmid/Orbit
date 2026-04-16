/**
 * ROUTE PATHS — single source of truth.
 *
 * Usage:
 *   import { ROUTES } from "@/router/routes";
 *   navigate(ROUTES.dashboard);
 *   navigate(ROUTES.userDetail("42"));
 *   navigate(ROUTES.search({ q: "react", page: "2" }));
 */

export const ROUTES = {
    // Root redirects to dashboard for authenticated users
    home: "/",

    // Auth (guest-only)
    login: "/login",
    signup: "/signup",
    forgotPassword: "/forgot-password",

    // Protected — static
    dashboard: "/dashboard",
    profile: "/profile",
    search: "/search",
    spaces: "/spaces",

    // Protected — settings (nested)
    settings: "/settings",
    settingsGeneral: "/settings/general",
    settingsSecurity: "/settings/security",

    // Protected — dynamic param helper
    userDetail: (userId: string) => `/users/${userId}`,
    spaceDetail: (spaceId: string) => `/spaces/${spaceId}`,
    spaceTransactions: (spaceId: string) => `/spaces/${spaceId}/transactions`,
    spaceEdit: (spaceId: string) => `/space/${spaceId}/edit`,
    accountInSpace: (spaceId: string, accountId: string) =>
        `/spaces/${spaceId}/accounts/${accountId}`,

    // Query-param helper  (returns a full path string)
    searchWithQuery: (params: { q?: string; page?: string }) => {
        const sp = new URLSearchParams();
        if (params.q) sp.set("q", params.q);
        if (params.page) sp.set("page", params.page);
        const qs = sp.toString();
        return qs ? `/search?${qs}` : "/search";
    },
} as const;
