import { createBrowserRouter } from "react-router-dom";

import { RootLayout } from "@/layouts/RootLayout";
import { AuthLayout } from "@/layouts/AuthLayout";
import { DashboardLayout } from "@/layouts/DashboardLayout";

// Route guards
import { PublicRoute } from "@/router/guards/PublicRoute";
import { ProtectedRoute } from "@/router/guards/ProtectedRoute";
import { GuestOnlyRoute } from "@/router/guards/GuestOnlyRoute";

// Public pages
import { HomePage } from "@/pages/public/HomePage";
import { AboutPage } from "@/pages/public/AboutPage";
import { NotFoundPage } from "@/pages/public/NotFoundPage";

// Auth pages (guest only — redirect if already logged in)
import { LoginPage } from "@/pages/auth/LoginPage";
import { SignupPage } from "@/pages/auth/SignupPage";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";

// Protected pages
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { ProfilePage } from "@/pages/dashboard/ProfilePage";
import { SettingsPage } from "@/pages/dashboard/SettingsPage";
import { SettingsGeneralPage } from "@/pages/dashboard/settings/SettingsGeneralPage";
import { SettingsSecurityPage } from "@/pages/dashboard/settings/SettingsSecurityPage";
import { UserDetailPage } from "@/pages/dashboard/UserDetailPage";
import { SearchPage } from "@/pages/dashboard/SearchPage";

export const router = createBrowserRouter([
    {
        // Root layout wraps everything (nav, footer, toasts, etc.)
        element: <RootLayout />,
        children: [
            // ─────────────────────────────────────────────
            // PUBLIC ROUTES — accessible by anyone
            // ─────────────────────────────────────────────
            {
                element: <PublicRoute />,
                children: [
                    {
                        path: "/",
                        element: <HomePage />,
                    },
                    {
                        path: "/about",
                        element: <AboutPage />,
                    },
                ],
            },

            // ─────────────────────────────────────────────
            // GUEST-ONLY ROUTES — redirect to /dashboard if logged in
            // ─────────────────────────────────────────────
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

            // ─────────────────────────────────────────────
            // PROTECTED ROUTES — redirect to /login if not logged in
            // ─────────────────────────────────────────────
            {
                element: <DashboardLayout />,
                children: [
                    {
                        element: <ProtectedRoute redirectTo="/login" />,
                        children: [
                            // /dashboard
                            {
                                path: "/dashboard",
                                element: <DashboardPage />,
                            },

                            // /profile — simple protected page
                            {
                                path: "/profile",
                                element: <ProfilePage />,
                            },

                            // /users/:userId — route with URL param
                            {
                                path: "/users/:userId",
                                element: <UserDetailPage />,
                            },

                            // /search?q=...&page=... — route with query params (read inside component)
                            {
                                path: "/search",
                                element: <SearchPage />,
                            },

                            // /settings — nested routes
                            {
                                path: "/settings",
                                element: <SettingsPage />,
                                children: [
                                    {
                                        // default child: /settings → redirects to /settings/general
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
                        ],
                    },
                ],
            },

            // ─────────────────────────────────────────────
            // 404 CATCH-ALL
            // ─────────────────────────────────────────────
            {
                path: "*",
                element: <NotFoundPage />,
            },
        ],
    },
]);
