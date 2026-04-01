import { TRPCError } from "@trpc/server";
import { procedure } from "../index.mjs";

const authorizedProcedure = procedure.use(async ({ ctx, next }) => {
    // if (ctx.user === null) {
    //     throw new TRPCError({
    //         code: "UNAUTHORIZED",
    //     });
    // }
    return next();
});
export default authorizedProcedure;
