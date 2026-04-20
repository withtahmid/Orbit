import { TRPCError } from "@trpc/server";
import type { Transaction } from "kysely";
import type { DB } from "../../db/kysely/types.mjs";

type AttachOpts = {
    trx: Transaction<DB>;
    fileIds: string[];
    userId: string;
    purpose: "transaction_receipt" | "event_attachment";
};

export const verifyFilesOwnedAndConfirmed = async ({
    trx,
    fileIds,
    userId,
    purpose,
}: AttachOpts) => {
    if (fileIds.length === 0) return;
    const rows = await trx
        .selectFrom("files")
        .where("id", "in", fileIds)
        .where("uploaded_by", "=", userId)
        .where("purpose", "=", purpose as any)
        .where("status", "=", "confirmed" as any)
        .select(["id"])
        .execute();
    if (rows.length !== fileIds.length) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: "One or more attachments are invalid or not confirmed",
        });
    }
};

export const attachFilesToTransaction = async (opts: {
    trx: Transaction<DB>;
    transactionId: string;
    fileIds: string[];
    userId: string;
}) => {
    if (opts.fileIds.length === 0) return;
    await verifyFilesOwnedAndConfirmed({
        trx: opts.trx,
        fileIds: opts.fileIds,
        userId: opts.userId,
        purpose: "transaction_receipt",
    });
    await opts.trx
        .insertInto("transaction_attachments")
        .values(opts.fileIds.map((file_id) => ({ transaction_id: opts.transactionId, file_id })))
        .execute();
};

export const attachFilesToEvent = async (opts: {
    trx: Transaction<DB>;
    eventId: string;
    fileIds: string[];
    userId: string;
}) => {
    if (opts.fileIds.length === 0) return;
    await verifyFilesOwnedAndConfirmed({
        trx: opts.trx,
        fileIds: opts.fileIds,
        userId: opts.userId,
        purpose: "event_attachment",
    });
    await opts.trx
        .insertInto("event_attachments")
        .values(opts.fileIds.map((file_id) => ({ event_id: opts.eventId, file_id })))
        .execute();
};
