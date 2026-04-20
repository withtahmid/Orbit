import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";

export const listAttachmentsForTransaction = authorizedProcedure
    .input(z.object({ transactionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
        const tx = await ctx.services.qb
            .selectFrom("transactions")
            .where("id", "=", input.transactionId)
            .select(["id", "space_id"])
            .executeTakeFirst();
        if (!tx) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
        }
        const member = await ctx.services.qb
            .selectFrom("space_members")
            .where("space_id", "=", tx.space_id)
            .where("user_id", "=", ctx.auth.user.id)
            .select("user_id")
            .executeTakeFirst();
        if (!member) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this space" });
        }

        const rows = await ctx.services.qb
            .selectFrom("transaction_attachments as ta")
            .innerJoin("files as f", "f.id", "ta.file_id")
            .where("ta.transaction_id", "=", input.transactionId)
            .select(["f.id", "f.mime_type", "f.original_name", "f.size_bytes", "f.created_at"])
            .orderBy("f.created_at", "asc")
            .execute();

        return rows.map((r) => ({
            id: r.id,
            mimeType: r.mime_type,
            originalName: r.original_name,
            sizeBytes: Number(r.size_bytes),
            createdAt: r.created_at,
        }));
    });
