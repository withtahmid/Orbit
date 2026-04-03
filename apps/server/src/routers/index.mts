import { router } from "../trpc/index.mjs";
import { healthProcedure } from "./health.mjs";
import { authRouter } from "./auth.mjs";

export const appRouter = router({
    health: healthProcedure,
    auth: authRouter,
});
export type AppRouter = typeof appRouter;
