import { z } from "zod";
import { TRPCError } from "@trpc/server";
import sharp from "sharp";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { logger } from "../../utils/logger.mjs";

const AVATAR_ORIGINAL_PX = 256;
const AVATAR_SM_PX = 64;

export const confirmUpload = authorizedProcedure
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
        if ((file.status as unknown as string) === "confirmed") {
            return { fileId: file.id, status: "confirmed" as const };
        }

        const [headErr] = await safeAwait(ctx.services.r2.headObject(file.r2_key));
        if (headErr) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Upload not found in storage; cannot confirm",
            });
        }

        if ((file.purpose as unknown as string) === "avatar") {
            const [err] = await safeAwait(generateAvatarVariants(ctx.services.r2, file.r2_key));
            if (err) {
                logger.error("Failed to generate avatar variants", err);
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to process avatar image",
                });
            }
        }

        await ctx.services.qb
            .updateTable("files")
            .set({
                status: "confirmed" as any,
                confirmed_at: new Date(),
                mime_type:
                    (file.purpose as unknown as string) === "avatar"
                        ? "image/webp"
                        : undefined,
            })
            .where("id", "=", file.id)
            .executeTakeFirstOrThrow();

        return { fileId: file.id, status: "confirmed" as const };
    });

const generateAvatarVariants = async (
    r2: {
        getObjectBuffer: (key: string) => Promise<Buffer>;
        putObjectBuffer: (key: string, body: Buffer, contentType: string) => Promise<void>;
    },
    originalKey: string
) => {
    const original = await r2.getObjectBuffer(originalKey);
    const [mainBuf, smBuf] = await Promise.all([
        sharp(original)
            .rotate()
            .resize(AVATAR_ORIGINAL_PX, AVATAR_ORIGINAL_PX, { fit: "cover" })
            .webp({ quality: 85 })
            .toBuffer(),
        sharp(original)
            .rotate()
            .resize(AVATAR_SM_PX, AVATAR_SM_PX, { fit: "cover" })
            .webp({ quality: 80 })
            .toBuffer(),
    ]);
    await Promise.all([
        r2.putObjectBuffer(originalKey, mainBuf, "image/webp"),
        r2.putObjectBuffer(`${originalKey}-sm`, smBuf, "image/webp"),
    ]);
};
