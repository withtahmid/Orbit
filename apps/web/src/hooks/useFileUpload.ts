import { useState } from "react";
import { trpc } from "@/trpc";

type Purpose = "avatar" | "transaction_receipt" | "event_attachment";

export const useFileUpload = () => {
    const createUploadUrl = trpc.file.createUploadUrl.useMutation();
    const confirm = trpc.file.confirm.useMutation();
    const [uploading, setUploading] = useState(false);

    const upload = async (file: File, purpose: Purpose): Promise<string> => {
        setUploading(true);
        try {
            const { fileId, uploadUrl } = await createUploadUrl.mutateAsync({
                purpose,
                originalName: file.name,
                mimeType: file.type,
                sizeBytes: file.size,
            });

            const put = await fetch(uploadUrl, {
                method: "PUT",
                body: file,
                headers: { "Content-Type": file.type },
            });
            if (!put.ok) {
                throw new Error(`Upload failed (${put.status})`);
            }

            await confirm.mutateAsync({ fileId });
            return fileId;
        } finally {
            setUploading(false);
        }
    };

    return { upload, uploading };
};
