import * as trpcExpress from "@trpc/server/adapters/express";
import { authorizeJWT, fetchUserFromJWT } from "./auth.mjs";
import { createServices } from "../services/index.mjs";
import { startIdempotencyCleanup } from "../services/idempotencyCleanup.mjs";
const services = createServices();
// Kick off the periodic idempotency-cache sweep. Module-level so it runs
// once per process lifetime, regardless of how many requests are served.
startIdempotencyCleanup(services.qb);
export const createContext = async ({ req }: trpcExpress.CreateExpressContextOptions) => {
    const decodedJWTPayload = await authorizeJWT(req.headers.authorization);
    const user = await fetchUserFromJWT(decodedJWTPayload, services.qb);
    return {
        auth: {
            user: user,
        },
        services,
    };
};
export type Context = Awaited<ReturnType<typeof createContext>>;
