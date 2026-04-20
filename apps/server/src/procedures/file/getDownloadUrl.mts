import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";

export const getDownloadUrl = authorizedProcedure
    .input(
        z.object({
            fileId: z.string().uuid(),
            variant: z.enum(["original", "sm"]).default("original"),
        })
    )
    .query(async ({ ctx, input }) => {
        const file = await ctx.services.qb
            .selectFrom("files")
            .where("id", "=", input.fileId)
            .select(["id", "r2_key", "purpose", "status", "uploaded_by", "mime_type"])
            .executeTakeFirst();
        if (!file) {
            throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
        }
        const status = file.status as unknown as string;
        const purpose = file.purpose as unknown as string;
        if (status !== "confirmed") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "File not confirmed" });
        }

        const userId = ctx.auth.user.id;

        if (purpose === "avatar") {
            // any authenticated user
        } else if (purpose === "transaction_receipt") {
            const row = await ctx.services.qb
                .selectFrom("transaction_attachments as ta")
                .innerJoin("transactions as t", "t.id", "ta.transaction_id")
                .innerJoin("space_members as sm", "sm.space_id", "t.space_id")
                .where("ta.file_id", "=", file.id)
                .where("sm.user_id", "=", userId)
                .select("ta.file_id")
                .executeTakeFirst();
            if (!row) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
            }
        } else if (purpose === "event_attachment") {
            const row = await ctx.services.qb
                .selectFrom("event_attachments as ea")
                .innerJoin("events as e", "e.id", "ea.event_id")
                .innerJoin("space_members as sm", "sm.space_id", "e.space_id")
                .where("ea.file_id", "=", file.id)
                .where("sm.user_id", "=", userId)
                .select("ea.file_id")
                .executeTakeFirst();
            if (!row) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
            }
        } else if (purpose === "exported_report") {
            if (file.uploaded_by !== userId) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
            }
        }

        const key =
            input.variant === "sm" && purpose === "avatar"
                ? `${file.r2_key}-sm`
                : file.r2_key;
        const [signErr, presigned] = await safeAwait(ctx.services.r2.createPresignedGet(key));
        if (signErr) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: signErr.message || "Failed to generate download URL",
            });
        }

        return {
            url: presigned.url,
            expiresAt: presigned.expiresAt.toISOString(),
            mimeType: file.mime_type,
        };
    });
