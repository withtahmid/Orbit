import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authorizedProcedure } from "../../trpc/middlewares/authorized.mjs";
import { safeAwait } from "../../utils/safeAwait.mjs";
import { resolveSpaceMembership } from "../space/utils/resolveSpaceMembership.mjs";
import type { SpaceMembers } from "../../db/kysely/types.mjs";

export const removeFileFromTransaction = authorizedProcedure
    .input(
        z.object({
            transactionId: z.string().uuid(),
            fileId: z.string().uuid(),
        })
    )
    .mutation(async ({ ctx, input }) => {
        const tx = await ctx.services.qb
            .selectFrom("transactions")
            .where("id", "=", input.transactionId)
            .select(["id", "space_id"])
            .executeTakeFirst();
        if (!tx) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
        }

        await resolveSpaceMembership({
            trx: ctx.services.qb,
            spaceId: tx.space_id,
            userId: ctx.auth.user.id,
            roles: ["owner", "editor"] as unknown as SpaceMembers["role"][],
        });

        const attachment = await ctx.services.qb
            .selectFrom("transaction_attachments as ta")
            .innerJoin("files as f", "f.id", "ta.file_id")
            .where("ta.transaction_id", "=", input.transactionId)
            .where("ta.file_id", "=", input.fileId)
            .select(["f.id as file_id", "f.r2_key", "f.purpose"])
            .executeTakeFirst();
        if (!attachment) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "Attachment not found on this transaction",
            });
        }

        await ctx.services.qb
            .deleteFrom("files")
            .where("id", "=", attachment.file_id)
            .executeTakeFirstOrThrow();

        const keys = [attachment.r2_key];
        if ((attachment.purpose as unknown as string) === "avatar") {
            keys.push(`${attachment.r2_key}-sm`);
        }
        await Promise.all(
            keys.map(async (k) => {
                const [err] = await safeAwait(ctx.services.r2.deleteObject(k));
                if (err) {
                    // swallow — DB row is gone; orphan object is harmless
                }
            })
        );

        return { ok: true as const };
    });
