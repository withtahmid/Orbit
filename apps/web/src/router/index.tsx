import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { RootLayout } from "@/layouts/RootLayout";
import { AuthLayout } from "@/layouts/AuthLayout";
import { AppShellLayout } from "@/layouts/AppShellLayout";
import { SpaceShellLayout } from "@/layouts/SpaceShellLayout";
import { GuestOnlyRoute } from "@/router/guards/GuestOnlyRoute";
import { ProtectedRoute } from "@/router/guards/ProtectedRoute";
import { CurrentSpaceProvider } from "@/providers/CurrentSpaceProvider";
import { RootRedirect } from "@/pages/RootRedirect";
import { FullPageSpinner } from "@/components/shared/LoadingScreen";
import NotFoundPage from "@/pages/NotFoundPage";
import { LoginPage } from "@/pages/auth/LoginPage";

const SignupPage = lazy(() => import("@/pages/auth/signup/index"));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/forgot-password/index"));
const DocsPage = lazy(() => import("@/pages/DocsPage"));

const SpaceSelectorPage = lazy(() => import("@/pages/app/SpaceSelectorPage"));
const ProfilePage = lazy(() => import("@/pages/app/ProfilePage"));
const SecurityPage = lazy(() => import("@/pages/app/SecurityPage"));
const MyAccountsPage = lazy(() => import("@/pages/app/MyAccountsPage"));

const SpaceOverviewPage = lazy(() => import("@/pages/space/OverviewPage"));
const AccountsPage = lazy(() => import("@/pages/space/accounts/AccountsPage"));
const AccountDetailPage = lazy(() => import("@/pages/space/accounts/AccountDetailPage"));
const TransactionsPage = lazy(() => import("@/pages/space/transactions/TransactionsPage"));
const EnvelopesPage = lazy(() => import("@/pages/space/envelopes/EnvelopesPage"));
const EnvelopeDetailPage = lazy(() => import("@/pages/space/envelopes/EnvelopeDetailPage"));
const PlansPage = lazy(() => import("@/pages/space/plans/PlansPage"));
const PlanDetailPage = lazy(() => import("@/pages/space/plans/PlanDetailPage"));
const CategoriesPage = lazy(() => import("@/pages/space/categories/CategoriesPage"));
const EventsPage = lazy(() => import("@/pages/space/events/EventsPage"));
const AnalyticsPage = lazy(() => import("@/pages/space/analytics/AnalyticsPage"));
const AnalyticsCashFlowView = lazy(
    () => import("@/pages/space/analytics/views/CashFlowView")
);
const AnalyticsCategoriesView = lazy(
    () => import("@/pages/space/analytics/views/CategoriesView")
);
const AnalyticsEnvelopesView = lazy(
    () => import("@/pages/space/analytics/views/EnvelopesView")
);
const AnalyticsBalanceView = lazy(
    () => import("@/pages/space/analytics/views/BalanceHistoryView")
);
const AnalyticsAccountsView = lazy(
    () => import("@/pages/space/analytics/views/AccountsView")
);
const AnalyticsHeatmapView = lazy(
    () => import("@/pages/space/analytics/views/HeatmapView")
);
const AnalyticsAllocationsView = lazy(
    () => import("@/pages/space/analytics/views/AllocationsView")
);
const AnalyticsPriorityView = lazy(
    () => import("@/pages/space/analytics/views/PriorityView")
);
const SpaceSettingsPage = lazy(() => import("@/pages/space/settings/SpaceSettingsPage"));

const withSuspense = (children: React.ReactNode) => (
    <Suspense fallback={<FullPageSpinner />}>{children}</Suspense>
);

export const router = createBrowserRouter([
    {
        element: <RootLayout />,
        children: [
            { path: "/", element: <RootRedirect /> },
            // Public docs — no auth guard. Prospective users can read
            // about the product before signing up; logged-in users can
            // reach it from the app-shell help link.
            { path: "/docs", element: withSuspense(<DocsPage />) },
            {
                element: <GuestOnlyRoute />,
                children: [
                    {
                        element: <AuthLayout />,
                        children: [
                            { path: "/login", element: <LoginPage /> },
                            { path: "/signup", element: withSuspense(<SignupPage />) },
                            {
                                path: "/forgot-password",
                                element: withSuspense(<ForgotPasswordPage />),
                            },
                        ],
                    },
                ],
            },
            {
                element: <ProtectedRoute />,
                children: [
                    {
                        element: <AppShellLayout />,
                        children: [
                            {
                                path: "/spaces",
                                element: withSuspense(<SpaceSelectorPage />),
                            },
                            {
                                path: "/settings",
                                element: <Navigate to="/settings/profile" replace />,
                            },
                            {
                                path: "/settings/profile",
                                element: withSuspense(<ProfilePage />),
                            },
                            {
                                path: "/settings/security",
                                element: withSuspense(<SecurityPage />),
                            },
                            {
                                path: "/accounts",
                                element: withSuspense(<MyAccountsPage />),
                            },
                            // Legacy /me URL — the virtual space now
                            // lives under /s/me via CurrentSpaceProvider
                            // sentinel. Redirect keeps old links working.
                            {
                                path: "/me",
                                element: <Navigate to="/s/me" replace />,
                            },
                        ],
                    },
                    {
                        path: "/s/:spaceId",
                        element: <CurrentSpaceProvider />,
                        children: [
                            {
                                element: <SpaceShellLayout />,
                                children: [
                                    { index: true, element: withSuspense(<SpaceOverviewPage />) },
                                    {
                                        path: "accounts",
                                        element: withSuspense(<AccountsPage />),
                                    },
                                    {
                                        path: "accounts/:accountId",
                                        element: withSuspense(<AccountDetailPage />),
                                    },
                                    {
                                        path: "transactions",
                                        element: withSuspense(<TransactionsPage />),
                                    },
                                    {
                                        path: "envelopes",
                                        element: withSuspense(<EnvelopesPage />),
                                    },
                                    {
                                        path: "envelopes/:envelopeId",
                                        element: withSuspense(<EnvelopeDetailPage />),
                                    },
                                    {
                                        path: "plans",
                                        element: withSuspense(<PlansPage />),
                                    },
                                    {
                                        path: "plans/:planId",
                                        element: withSuspense(<PlanDetailPage />),
                                    },
                                    {
                                        path: "categories",
                                        element: withSuspense(<CategoriesPage />),
                                    },
                                    {
                                        path: "events",
                                        element: withSuspense(<EventsPage />),
                                    },
                                    {
                                        path: "analytics",
                                        element: withSuspense(<AnalyticsPage />),
                                    },
                                    {
                                        path: "analytics/cash-flow",
                                        element: withSuspense(<AnalyticsCashFlowView />),
                                    },
                                    {
                                        path: "analytics/categories",
                                        element: withSuspense(<AnalyticsCategoriesView />),
                                    },
                                    {
                                        path: "analytics/envelopes",
                                        element: withSuspense(<AnalyticsEnvelopesView />),
                                    },
                                    {
                                        path: "analytics/balance",
                                        element: withSuspense(<AnalyticsBalanceView />),
                                    },
                                    {
                                        path: "analytics/accounts",
                                        element: withSuspense(<AnalyticsAccountsView />),
                                    },
                                    {
                                        path: "analytics/heatmap",
                                        element: withSuspense(<AnalyticsHeatmapView />),
                                    },
                                    {
                                        path: "analytics/allocations",
                                        element: withSuspense(<AnalyticsAllocationsView />),
                                    },
                                    {
                                        path: "analytics/priority",
                                        element: withSuspense(<AnalyticsPriorityView />),
                                    },
                                    {
                                        path: "settings",
                                        element: withSuspense(<SpaceSettingsPage />),
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            { path: "*", element: <NotFoundPage /> },
        ],
    },
]);
