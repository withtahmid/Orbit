import { router } from "../trpc/index.mjs";
import { healthProcedure } from "./health.mjs";
// import publicProcedure from "../trpc/procedures/public.mjs";

export const appRouter = router({
    health: healthProcedure,
});
export type AppRouter = typeof appRouter;
