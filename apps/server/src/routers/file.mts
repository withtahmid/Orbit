import { router } from "../trpc/index.mjs";
import { createUploadUrl } from "../procedures/file/createUploadUrl.mjs";
import { confirmUpload } from "../procedures/file/confirm.mjs";
import { getDownloadUrl } from "../procedures/file/getDownloadUrl.mjs";
import { deleteFile } from "../procedures/file/delete.mjs";
import { listAttachmentsForTransaction } from "../procedures/file/listForTransaction.mjs";
import { listAttachmentsForEvent } from "../procedures/file/listForEvent.mjs";
import { removeFileFromTransaction } from "../procedures/file/removeFromTransaction.mjs";

export const fileRouter = router({
    createUploadUrl,
    confirm: confirmUpload,
    getDownloadUrl,
    delete: deleteFile,
    listForTransaction: listAttachmentsForTransaction,
    listForEvent: listAttachmentsForEvent,
    removeFromTransaction: removeFileFromTransaction,
});
