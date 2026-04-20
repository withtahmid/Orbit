import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";

export const deleteFile = authorizedProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
        const file = await ctx.services.qb
            .selectFrom("files")
            .where("id", "=", input.fileId)
            .where("uploaded_by", "=", ctx.auth.user.id)
            .select(["id", "r2_key", "status", "purpose"])
            .executeTakeFirst();
        if (!file) {
            throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
        }

        await ctx.services.qb
            .deleteFrom("files")
            .where("id", "=", file.id)
            .executeTakeFirstOrThrow();

        // Best-effort R2 delete; a leftover object is harmless (orphan).
        const keys = [file.r2_key];
        if ((file.purpose as unknown as string) === "avatar") {
            keys.push(`${file.r2_key}-sm`);
        }
        await Promise.all(
            keys.map(async (k) => {
                const [r2Err] = await safeAwait(ctx.services.r2.deleteObject(k));
                if (r2Err) {
                    // Swallow — DB row is gone, object will be cleaned up by a sweep job.
                }
            })
        );

        return { ok: true as const };
    });
