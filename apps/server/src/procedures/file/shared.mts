import { z } from "zod";

export const uploadablePurposeSchema = z.enum([
    "avatar",
    "transaction_receipt",
    "event_attachment",
]);
export type UploadablePurpose = z.infer<typeof uploadablePurposeSchema>;

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const RECEIPT_MIMES = [...IMAGE_MIMES, "application/pdf"] as const;

export const PURPOSE_LIMITS: Record<
    UploadablePurpose,
    { maxBytes: number; allowedMimes: readonly string[] }
> = {
    avatar: { maxBytes: 5 * 1024 * 1024, allowedMimes: IMAGE_MIMES },
    transaction_receipt: { maxBytes: 20 * 1024 * 1024, allowedMimes: RECEIPT_MIMES },
    event_attachment: { maxBytes: 20 * 1024 * 1024, allowedMimes: RECEIPT_MIMES },
};

export const buildR2Key = (purpose: UploadablePurpose | "exported_report", fileId: string) =>
    `${purpose}/${fileId}`;
