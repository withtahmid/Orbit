import * as trpcExpress from "@trpc/server/adapters/express";
import cors from "cors";
import express from "express";
import { expressHandler } from "trpc-playground/handlers/express";
import run_bootstrap from "./bootstrap.mjs";
import { playgroundEndpoint, trpcApiEndpoint } from "./config/endpoint.mjs";
import { ENV } from "./env.mjs";
import { appRouter, AppRouter } from "./routers/index.mjs";
import { createContext } from "./trpc/context.mjs";
import { logger } from "./utils/logger.mjs";

await run_bootstrap();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", async (req, res) => {
    return res.status(200).json({
        hostname: req.hostname,
        message: "HELLO FROM BACKEND",
        unix: Date.now(),
        time: new Date().toISOString(),
    });
});

app.use(
    trpcApiEndpoint,
    trpcExpress.createExpressMiddleware<AppRouter>({
        router: appRouter,
        createContext,
    })
);

if (process.env.NODE_ENV === "development") {
    app.use(
        playgroundEndpoint,
        await expressHandler({
            trpcApiEndpoint,
            playgroundEndpoint,
            router: appRouter,
        })
    );
}

app.listen(ENV.PORT, () => {
    logger.info(`SERVER STARTED LISTENING ON PORT: ${ENV.PORT}`);
});
