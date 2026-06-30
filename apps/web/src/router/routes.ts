/** Maps the legacy analytics view slugs to the cockpit tab that absorbed
 *  them. Used by `spaceAnalyticsDetail` and the legacy route redirects. */
const ANALYTICS_VIEW_TO_TAB = {
    "cash-flow": "cashflow",
    categories: "spending",
    envelopes: "budget",
    balance: "accounts",
    accounts: "accounts",
    heatmap: "spending",
    allocations: "budget",
    trends: "insights",
    anomalies: "insights",
    priority: "spending",
} as const;

export const ROUTES = {
    root: "/",
    docs: "/docs",
    login: "/login",
    signup: "/signup",
    forgotPassword: "/forgot-password",
    spaces: "/spaces",
    profile: "/settings/profile",
    security: "/settings/security",
    myAccounts: "/accounts",
    space: (id: string) => `/s/${id}`,
    spaceOverview: (id: string) => `/s/${id}`,
    spaceAccounts: (id: string) => `/s/${id}/accounts`,
    spaceAccountDetail: (id: string, accId: string) => `/s/${id}/accounts/${accId}`,
    spaceTransactions: (id: string) => `/s/${id}/transactions`,
    spaceBudgets: (id: string) => `/s/${id}/budgets`,
    spaceBudgetDetail: (id: string, envId: string) => `/s/${id}/budgets/${envId}`,
    spaceBudgetMonth: (id: string, month: string) => `/s/${id}/budgets/month/${month}`,
    spaceYearReport: (id: string, year: number) => `/s/${id}/year/${year}`,
    spaceCategories: (id: string) => `/s/${id}/categories`,
    spaceEvents: (id: string) => `/s/${id}/events`,
    spaceEventDetail: (id: string, eventId: string) => `/s/${id}/events/${eventId}`,
    spaceAnalytics: (id: string) => `/s/${id}/analytics`,
    spaceAnalyticsTab: (id: string, tab: string) => `/s/${id}/analytics?tab=${tab}`,
    /** Legacy per-view links now resolve straight to the cockpit tab that
     *  absorbed that view — no redirect hop. */
    spaceAnalyticsDetail: (id: string, view: string) => {
        const tab = ANALYTICS_VIEW_TO_TAB[
            view as keyof typeof ANALYTICS_VIEW_TO_TAB
        ] as string | undefined;
        return tab
            ? `/s/${id}/analytics?tab=${tab}`
            : `/s/${id}/analytics`;
    },
    spaceSettings: (id: string) => `/s/${id}/settings`,
    inviteAccept: (token: string) => `/invite/${token}`,
} as const;
