import { TRPCError } from "@trpc/server";
import type { AuthenticatedUser } from "../auth.mjs";
import { t } from "../index.mjs";
import { mutationLoggerMiddleware } from "./mutationLogger.mjs";

export const authorizedProcedure = t.procedure
    .use(mutationLoggerMiddleware)
    .use(async function is_authenticated(opts) {
        if (!opts.ctx.auth.user) {
            throw new TRPCError({
                code: "UNAUTHORIZED",
                message: "Please login first to make this request",
            });
        }

        return await opts.next({
            ctx: {
                ...opts.ctx,
                auth: {
                    ...opts.ctx.auth,
                    user: opts.ctx.auth.user as AuthenticatedUser,
                },
            },
        });
    });
