/**
 * Identifies when the frontend is running against the public read-only
 * demo deployment at orbit-demo.withtahmid.com. Used to show the
 * DemoBanner and any other demo-specific UI affordances.
 *
 * Primary signal is the hostname — the demo domain is stable and
 * doesn't require a separate build-time env var. For local testing of
 * demo UI without pointing at the prod hostname, set
 * `VITE_IS_DEMO=true` at build time.
 */
export const IS_DEMO =
    (typeof window !== "undefined" &&
        window.location.hostname === "orbit-demo.withtahmid.com") ||
    (import.meta as unknown as { env: Record<string, string | undefined> }).env
        .VITE_IS_DEMO === "true";

export const PRODUCTION_URL = "https://orbit.withtahmid.com";
export const DEMO_URL = "https://orbit-demo.withtahmid.com";
