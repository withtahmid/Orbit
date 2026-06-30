import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { RootLayout } from "@/layouts/RootLayout";
import { AuthLayout } from "@/layouts/AuthLayout";
import { AppShellLayout } from "@/layouts/AppShellLayout";
import { SpaceLayout } from "@/layouts/SpaceLayout";
import { GuestOnlyRoute } from "@/router/guards/GuestOnlyRoute";
import { ProtectedRoute } from "@/router/guards/ProtectedRoute";
import { CurrentSpaceProvider } from "@/providers/CurrentSpaceProvider";
import { RootRedirect } from "@/pages/RootRedirect";
import { FullPageSpinner } from "@/components/shared/LoadingScreen";
import NotFoundPage from "@/pages/NotFoundPage";
import ErrorBoundaryPage from "@/pages/ErrorBoundaryPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RedirectToTab } from "@/pages/space/analytics/RedirectToTab";

const SignupPage = lazy(() => import("@/pages/auth/signup/index"));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/forgot-password/index"));
const DocsPage = lazy(() => import("@/pages/DocsPage"));
const AcceptInvitePage = lazy(() => import("@/pages/AcceptInvitePage"));

const SpaceSelectorPage = lazy(() => import("@/pages/app/SpaceSelectorPage"));
const ProfilePage = lazy(() => import("@/pages/app/ProfilePage"));
const SecurityPage = lazy(() => import("@/pages/app/SecurityPage"));
const MyAccountsPage = lazy(() => import("@/pages/app/MyAccountsPage"));

const SpaceOverviewPage = lazy(() => import("@/pages/space/OverviewPage"));
const AccountsPage = lazy(() => import("@/pages/space/accounts/AccountsPage"));
const AccountDetailPage = lazy(() => import("@/pages/space/accounts/AccountDetailPage"));
const TransactionsPage = lazy(() => import("@/pages/space/transactions/TransactionsPage"));
const BudgetsPage = lazy(() => import("@/pages/space/budgets/BudgetsPage"));
const BudgetDetailPage = lazy(() => import("@/pages/space/budgets/BudgetDetailPage"));
const BudgetMonthPage = lazy(() => import("@/pages/space/budgets/BudgetMonthPage"));
const YearReportPage = lazy(() => import("@/pages/space/year/YearReportPage"));
const CategoriesPage = lazy(() => import("@/pages/space/categories/CategoriesPage"));
const EventsPage = lazy(() => import("@/pages/space/events/EventsPage"));
const EventDetailPage = lazy(() => import("@/pages/space/events/EventDetailPage"));
const AnalyticsCockpitPage = lazy(
    () => import("@/pages/space/analytics/AnalyticsCockpitPage")
);
const SpaceSettingsPage = lazy(() => import("@/pages/space/settings/SpaceSettingsPage"));

const withSuspense = (children: React.ReactNode) => (
    <Suspense fallback={<FullPageSpinner />}>{children}</Suspense>
);

export const router = createBrowserRouter([
    {
        element: <RootLayout />,
        errorElement: <ErrorBoundaryPage />,
        children: [
            { path: "/", element: <RootRedirect /> },
            // Public docs — no auth guard. Prospective users can read
            // about the product before signing up; logged-in users can
            // reach it from the app-shell help link.
            { path: "/docs", element: withSuspense(<DocsPage />) },
            // Invite acceptance is public so the page can render space
            // metadata before the user signs in. The page itself
            // bounces unauthenticated visitors to /login?from=… and
            // calls the auth-only accept mutation once signed in.
            { path: "/invite/:token", element: withSuspense(<AcceptInvitePage />) },
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
                    // Space selector renders its own full-viewport chrome
                    // (logo header + grid). It deliberately sits outside
                    // AppShellLayout so it isn't double-wrapped.
                    {
                        path: "/spaces",
                        element: withSuspense(<SpaceSelectorPage />),
                    },
                    {
                        element: <AppShellLayout />,
                        children: [
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
                                element: <SpaceLayout />,
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
                                        path: "budgets",
                                        element: withSuspense(<BudgetsPage />),
                                    },
                                    {
                                        path: "budgets/month/:month",
                                        element: withSuspense(<BudgetMonthPage />),
                                    },
                                    {
                                        path: "budgets/:envelopeId",
                                        element: withSuspense(<BudgetDetailPage />),
                                    },
                                    {
                                        path: "year/:year",
                                        element: withSuspense(<YearReportPage />),
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
                                        path: "events/:eventId",
                                        element: withSuspense(<EventDetailPage />),
                                    },
                                    {
                                        path: "analytics",
                                        element: withSuspense(<AnalyticsCockpitPage />),
                                    },
                                    // Legacy per-view routes now redirect into
                                    // the cockpit with the matching tab so old
                                    // bookmarks and shared links keep working.
                                    {
                                        path: "analytics/cash-flow",
                                        element: <RedirectToTab tab="cashflow" />,
                                    },
                                    {
                                        path: "analytics/categories",
                                        element: <RedirectToTab tab="spending" />,
                                    },
                                    {
                                        path: "analytics/envelopes",
                                        element: <RedirectToTab tab="budget" />,
                                    },
                                    {
                                        path: "analytics/balance",
                                        element: <RedirectToTab tab="accounts" />,
                                    },
                                    {
                                        path: "analytics/accounts",
                                        element: <RedirectToTab tab="accounts" />,
                                    },
                                    {
                                        path: "analytics/heatmap",
                                        element: <RedirectToTab tab="spending" />,
                                    },
                                    {
                                        path: "analytics/allocations",
                                        element: <RedirectToTab tab="budget" />,
                                    },
                                    {
                                        path: "analytics/trends",
                                        element: <RedirectToTab tab="insights" />,
                                    },
                                    {
                                        path: "analytics/anomalies",
                                        element: <RedirectToTab tab="insights" />,
                                    },
                                    {
                                        path: "analytics/priority",
                                        element: <RedirectToTab tab="spending" />,
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
