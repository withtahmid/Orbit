import { TRPCError } from "@trpc/server";
import { ENV } from "../../env.mjs";
import { t } from "../index.mjs";

export const filterMutationsOnDemoMiddleware = t.middleware(async (opts) => {
    if (opts.type === "mutation" && ENV.NODE_ENV === "demo" && opts.path !== "auth.login") {
        throw new TRPCError({
            code: "FORBIDDEN",
            message:
                "Operations are disabled in demo mode. Please log in to orbit.withtahmid.com to access the full features of the application.",
        });
    }
    return await opts.next();
});
