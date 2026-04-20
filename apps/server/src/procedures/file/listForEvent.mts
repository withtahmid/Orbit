import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";

export const listAttachmentsForEvent = authorizedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
        const event = await ctx.services.qb
            .selectFrom("events")
            .where("id", "=", input.eventId)
            .select(["id", "space_id"])
            .executeTakeFirst();
        if (!event) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }
        const member = await ctx.services.qb
            .selectFrom("space_members")
            .where("space_id", "=", event.space_id)
            .where("user_id", "=", ctx.auth.user.id)
            .select("user_id")
            .executeTakeFirst();
        if (!member) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this space" });
        }

        const rows = await ctx.services.qb
            .selectFrom("event_attachments as ea")
            .innerJoin("files as f", "f.id", "ea.file_id")
            .where("ea.event_id", "=", input.eventId)
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
