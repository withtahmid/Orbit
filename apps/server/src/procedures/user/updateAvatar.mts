import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";

export const updateAvatar = authorizedProcedure
    .input(z.object({ fileId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
        if (input.fileId !== null) {
            const file = await ctx.services.qb
                .selectFrom("files")
                .where("id", "=", input.fileId)
                .where("uploaded_by", "=", ctx.auth.user.id)
                .select(["id", "purpose", "status"])
                .executeTakeFirst();
            if (!file) {
                throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
            }
            if ((file.purpose as unknown as string) !== "avatar") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "File is not an avatar",
                });
            }
            if ((file.status as unknown as string) !== "confirmed") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "File not confirmed",
                });
            }
        }

        const [err] = await safeAwait(
            ctx.services.qb
                .updateTable("users")
                .set({ avatar_file_id: input.fileId })
                .where("id", "=", ctx.auth.user.id)
                .executeTakeFirstOrThrow()
        );
        if (err) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: err.message || "Failed to update avatar",
            });
        }

        return { avatar_file_id: input.fileId };
    });
