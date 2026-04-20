import { useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFileUpload } from "@/hooks/useFileUpload";

type Purpose = "transaction_receipt" | "event_attachment";

type UploadedFile = {
    fileId: string;
    name: string;
    sizeBytes: number;
};

type Props = {
    purpose: Purpose;
    fileIds: string[];
    onChange: (fileIds: string[]) => void;
    accept?: string;
    maxFiles?: number;
    label?: string;
};

const DEFAULT_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf";

export const FileUploadField = ({
    purpose,
    fileIds,
    onChange,
    accept = DEFAULT_ACCEPT,
    maxFiles = 10,
    label = "Attachments",
}: Props) => {
    const { upload, uploading } = useFileUpload();
    const inputRef = useRef<HTMLInputElement>(null);
    const [items, setItems] = useState<UploadedFile[]>([]);

    const addFile = async (file: File) => {
        if (fileIds.length >= maxFiles) {
            toast.error(`Maximum ${maxFiles} files`);
            return;
        }
        try {
            const fileId = await upload(file, purpose);
            const next: UploadedFile = { fileId, name: file.name, sizeBytes: file.size };
            setItems((prev) => [...prev, next]);
            onChange([...fileIds, fileId]);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Upload failed");
        }
    };

    const remove = (fileId: string) => {
        setItems((prev) => prev.filter((i) => i.fileId !== fileId));
        onChange(fileIds.filter((id) => id !== fileId));
    };

    return (
        <div className="grid gap-2">
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{label}</label>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading || fileIds.length >= maxFiles}
                    onClick={() => inputRef.current?.click()}
                >
                    {uploading ? (
                        <Loader2 className="size-3 animate-spin" />
                    ) : (
                        <Paperclip className="size-3" />
                    )}
                    Add file
                </Button>
            </div>
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void addFile(file);
                    e.target.value = "";
                }}
            />
            {items.length > 0 && (
                <ul className="grid gap-1">
                    {items.map((item) => (
                        <li
                            key={item.fileId}
                            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                        >
                            <span className="truncate">{item.name}</span>
                            <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground"
                                onClick={() => remove(item.fileId)}
                                aria-label="Remove file"
                            >
                                <X className="size-3" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
