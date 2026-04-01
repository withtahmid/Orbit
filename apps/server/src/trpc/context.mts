import * as trpcExpress from "@trpc/server/adapters/express";
import { getUserFromAuthHeader, JWTPayload } from "./auth.mjs";
import { createServices } from "../services/index.mjs";

export const createContext = async ({ req, res }: trpcExpress.CreateExpressContextOptions) => {
    const user = await getUserFromAuthHeader(req.headers.authorization);
    return {
        auth: { user } as { user: JWTPayload | null },
        services: createServices(),
    };
};
export type Context = Awaited<ReturnType<typeof createContext>>;
