import { createBrowserRouter, Navigate } from "react-router-dom";

import { RootLayout } from "@/layouts/RootLayout";
import { AuthLayout } from "@/layouts/AuthLayout";
import { DashboardLayout } from "@/layouts/DashboardLayout";

// Route guards
import { ProtectedRoute } from "@/router/guards/ProtectedRoute";
import { GuestOnlyRoute } from "@/router/guards/GuestOnlyRoute";

import { NotFoundPage } from "@/pages/public/NotFoundPage";

// Auth pages (guest only — redirect if already logged in)
import { LoginPage } from "@/pages/auth/LoginPage";
import { SignupPage } from "@/pages/auth/signup";
import { ForgotPasswordPage } from "@/pages/auth/forgot-password";

// Protected pages
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { ProfilePage } from "@/pages/dashboard/ProfilePage";
import { SettingsPage } from "@/pages/dashboard/SettingsPage";
import { SettingsGeneralPage } from "@/pages/dashboard/settings/SettingsGeneralPage";
import { SettingsSecurityPage } from "@/pages/dashboard/settings/SettingsSecurityPage";
import { UserDetailPage } from "@/pages/dashboard/UserDetailPage";
import { SearchPage } from "@/pages/dashboard/SearchPage";
import { SpacesPage } from "@/pages/dashboard/SpacesPage";
import { SpaceDetailPage } from "@/pages/dashboard/SpaceDetailPage";
import { SpaceEditPage } from "@/pages/dashboard/SpaceEditPage";
import { AccountManagePage } from "@/pages/dashboard/AccountManagePage";
import { SpaceTransactionsPage } from "@/pages/dashboard/SpaceTransactionsPage";

export const router = createBrowserRouter([
    {
        element: <RootLayout />,
        children: [
            {
                element: <AuthLayout />,
                children: [
                    {
                        element: <GuestOnlyRoute redirectTo="/dashboard" />,
                        children: [
                            {
                                path: "/login",
                                element: <LoginPage />,
                            },
                            {
                                path: "/signup",
                                element: <SignupPage />,
                            },
                            {
                                path: "/forgot-password",
                                element: <ForgotPasswordPage />,
                            },
                        ],
                    },
                ],
            },
            {
                element: <DashboardLayout />,
                children: [
                    {
                        element: <ProtectedRoute redirectTo="/login" />,
                        children: [
                            {
                                path: "/",
                                element: <Navigate to="/dashboard" replace />,
                            },
                            {
                                path: "/dashboard",
                                element: <DashboardPage />,
                            },
                            {
                                path: "/profile",
                                element: <ProfilePage />,
                            },
                            {
                                path: "/users/:userId",
                                element: <UserDetailPage />,
                            },
                            {
                                path: "/search",
                                element: <SearchPage />,
                            },

                            {
                                path: "/spaces",
                                element: <SpacesPage />,
                            },
                            {
                                path: "/spaces/:id",
                                element: <SpaceDetailPage />,
                            },
                            {
                                path: "/spaces/:id/accounts/:accountId",
                                element: <AccountManagePage />,
                            },
                            {
                                path: "/spaces/:id/transactions",
                                element: <SpaceTransactionsPage />,
                            },
                            {
                                path: "/space/:id/edit",
                                element: <SpaceEditPage />,
                            },

                            // /settings — nested routes
                            {
                                path: "/settings",
                                element: <SettingsPage />,
                                children: [
                                    {
                                        index: true,
                                        element: <SettingsGeneralPage />,
                                    },
                                    {
                                        path: "general",
                                        element: <SettingsGeneralPage />,
                                    },
                                    {
                                        path: "security",
                                        element: <SettingsSecurityPage />,
                                    },
                                ],
                            },
                            {
                                path: "*",
                                element: <NotFoundPage />,
                            },
                        ],
                    },
                ],
            },
        ],
    },
]);
