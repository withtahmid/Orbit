import { router } from "../trpc/index.mjs";
import { healthProcedure } from "./health.mjs";
import { authRouter } from "./auth.mjs";
import { spaceRouter } from "./space.mjs";
import { accountRouter } from "./account.mjs";
import { eventRouter } from "./event.mjs";

export const appRouter = router({
    health: healthProcedure,
    auth: authRouter,
    space: spaceRouter,
    account: accountRouter,
    event: eventRouter,
});
export type AppRouter = typeof appRouter;
