import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { PURPOSE_LIMITS, buildR2Key, uploadablePurposeSchema } from "./shared.mjs";
import type { Files } from "../../db/kysely/types.mjs";

export const createUploadUrl = authorizedProcedure
    .input(
        z.object({
            purpose: uploadablePurposeSchema,
            originalName: z.string().min(1).max(255),
            mimeType: z.string().min(1).max(127),
            sizeBytes: z.number().int().positive(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const limits = PURPOSE_LIMITS[input.purpose];
        if (input.sizeBytes > limits.maxBytes) {
            throw new TRPCError({
                code: "PAYLOAD_TOO_LARGE",
                message: `File exceeds ${Math.floor(limits.maxBytes / 1024 / 1024)} MB limit for ${input.purpose}`,
            });
        }
        if (!limits.allowedMimes.includes(input.mimeType)) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: `MIME type ${input.mimeType} not allowed for ${input.purpose}`,
            });
        }

        const [insertErr, fileRow] = await safeAwait(
            ctx.services.qb
                .insertInto("files")
                .values({
                    r2_key: "__placeholder__",
                    mime_type: input.mimeType,
                    size_bytes: input.sizeBytes,
                    original_name: input.originalName,
                    purpose: input.purpose as unknown as Files["purpose"],
                    uploaded_by: ctx.auth.user.id,
                })
                .returning(["id"])
                .executeTakeFirstOrThrow()
        );
        if (insertErr) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: insertErr.message || "Failed to register file",
            });
        }

        const key = buildR2Key(input.purpose, fileRow.id);
        const [updateErr] = await safeAwait(
            ctx.services.qb
                .updateTable("files")
                .set({ r2_key: key })
                .where("id", "=", fileRow.id)
                .executeTakeFirstOrThrow()
        );
        if (updateErr) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: updateErr.message || "Failed to set file key",
            });
        }

        const [signErr, presigned] = await safeAwait(
            ctx.services.r2.createPresignedPut({ key })
        );
        if (signErr) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: signErr.message || "Failed to generate upload URL",
            });
        }

        return {
            fileId: fileRow.id,
            uploadUrl: presigned.url,
            expiresAt: presigned.expiresAt.toISOString(),
        };
    });
