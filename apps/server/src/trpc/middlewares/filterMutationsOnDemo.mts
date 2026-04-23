import { TRPCError } from "@trpc/server";
import { IS_DEMO } from "../../env.mjs";
import { t } from "../index.mjs";

/**
 * Mutations that must remain callable in demo mode. Keep this set tight —
 * every entry is a hole in the write-freeze. `auth.login` stays because
 * the demo landing page needs to sign users into the read-only demo
 * account; everything else (signup, password reset, etc.) is intentionally
 * blocked so the demo cannot accumulate user state.
 */
const DEMO_ALLOWED_MUTATIONS: ReadonlySet<string> = new Set(["auth.login"]);

export const filterMutationsOnDemoMiddleware = t.middleware(async (opts) => {
    if (IS_DEMO && opts.type === "mutation" && !DEMO_ALLOWED_MUTATIONS.has(opts.path)) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message:
                "Operations are disabled in demo mode. Please log in to orbit.withtahmid.com to access the full features of the application.",
        });
    }
    return await opts.next();
});
