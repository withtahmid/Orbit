import { Outlet } from "react-router-dom";

/**
 * Auth route group passthrough — each auth page (login / signup / forgot-password)
 * renders its own full-viewport chrome via AuthShell or LegacyAuthChrome, so this
 * layout intentionally adds nothing.
 */
export function AuthLayout() {
    return <Outlet />;
}
