import { procedure } from "../index.mjs";
import { filterMutationsOnDemoMiddleware } from "./filterMutationsOnDemo.mjs";
import { mutationLoggerMiddleware } from "./mutationLogger.mjs";

const publicProcedure = procedure;
export default publicProcedure.use(filterMutationsOnDemoMiddleware).use(mutationLoggerMiddleware);
