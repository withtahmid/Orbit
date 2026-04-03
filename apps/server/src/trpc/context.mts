import * as trpcExpress from "@trpc/server/adapters/express";
import { authorizeJWT, fetchUserFromJWT } from "./auth.mjs";
import { createServices } from "../services/index.mjs";

export const createContext = async ({ req }: trpcExpress.CreateExpressContextOptions) => {
    const decodedJWTPayload = await authorizeJWT(req.headers.authorization);
    const services = createServices();
    const user = await fetchUserFromJWT(decodedJWTPayload, services.qb);

    return {
        auth: {
            user: user,
        },
        services,
    };
};
export type Context = Awaited<ReturnType<typeof createContext>>;
