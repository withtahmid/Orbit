import { Outlet, ScrollRestoration } from "react-router-dom";

/**
 * RootLayout
 *
 * The outermost shell. Good place for:
 *   - Global nav / header / footer
 *   - Toast / notification portal
 *   - Theme providers
 */
export function RootLayout() {
    return (
        <>
            <ScrollRestoration />
            {/* Global Toasts, Modals, etc. go here */}
            <Outlet />
        </>
    );
}
