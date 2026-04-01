import * as trpcExpress from "@trpc/server/adapters/express";
import createPGPool from "../db/index.mjs";
import { createQueryBuilder } from "../db/kysely/index.mjs";
import { logger } from "../utils/logger.mjs";
import { getUserFromAuthHeader } from "./auth.mjs";
import { createServices } from "../services/index.mjs";

export const createContext = async ({ req, res }: trpcExpress.CreateExpressContextOptions) => {
    const headers = req.headers;
    const hostname = req.headers.hostname;
    const user = await getUserFromAuthHeader(req.headers.authorization);
    return {
        auth: { user },
        services: createServices(),
    };
};
export type Context = Awaited<ReturnType<typeof createContext>>;
