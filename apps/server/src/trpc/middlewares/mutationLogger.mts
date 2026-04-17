import { stripAnsi } from "../../utils/ansi.mjs";
import { t } from "../index.mjs";

export const mutationLoggerMiddleware = t.middleware(async (opts) => {
    const startTime = process.hrtime.bigint();
    const result = await opts.next();
    const endTime = process.hrtime.bigint();
    if (opts.type === "mutation") {
        const durationMs = Number(endTime - startTime) / 1e6;
        const userId = opts.ctx.auth.user?.id ?? null;
        const path = opts.path;
        const input = await opts.getRawInput();
        const is_success = result.ok;
        const error_message = result.ok ? null : result.error.message;
        const data = result.ok ? result.data : null;
        const duration = durationMs;
        const error_code = result.ok ? null : result.error.code;
        const error_stack = result.ok ? null : result.error.stack;

        void {
            user_id: userId,
            path,
            input: input !== null ? JSON.stringify(input) : null,
            is_success,
            error_message: error_message ? JSON.stringify(stripAnsi(error_message)) : null,
            error_code,
            error_stack: stripAnsi(error_stack),
            data: data !== null ? JSON.stringify(data) : null,
            duration,
        };

        // const [error] = await safeAwait(
        //     opts.ctx.services.qb
        //         .insertInto("mutation_logs")
        //         .values(insert)
        //         .executeTakeFirstOrThrow()
        // );
        // if (error) {
        //     logger.error("FAILED TO LOG MUTATION:");
        //     logger.error(error);
        // }
    }

    return result;
});
