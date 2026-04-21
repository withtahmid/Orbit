import { useRef } from "react";
import { toast } from "sonner";
import {
    Download,
    FileText,
    Loader2,
    Paperclip,
    Trash2,
    X,
} from "lucide-react";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { TransactionTypeBadge } from "@/components/shared/TransactionTypeBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { trpc } from "@/trpc";
import { formatInAppTz } from "@/lib/formatDate";

type TxType = "income" | "expense" | "transfer" | "adjustment";

type Transaction = {
    id: string;
    space_id: string;
    type: unknown;
    amount: string | number;
    source_account_id: string | null;
    destination_account_id: string | null;
    description: string | null;
    location: string | null;
    transaction_datetime: Date | string;
    created_at: Date | string;
    event_id: string | null;
    expense_category_id: string | null;
    created_by: string;
    created_by_first_name?: string | null;
    created_by_last_name?: string | null;
    created_by_avatar_file_id?: string | null;
    /**
     * Transfer fee columns — only populated on transfers that carried
     * a fee (wire, ATM, FX, etc.). Both move together; see spec §11.6.
     */
    fee_amount?: string | number | null;
    fee_expense_category_id?: string | null;
};

type Props = {
    transaction: Transaction | null;
    open: boolean;
    onClose: () => void;
    accountsById: Map<string, { name: string }>;
    categoriesById: Map<string, { name: string }>;
    eventsById: Map<string, { name: string }>;
    canEdit: boolean;
};

export function TransactionDetailsSheet({
    transaction,
    open,
    onClose,
    accountsById,
    categoriesById,
    eventsById,
    canEdit,
}: Props) {
    return (
        <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
            <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
                {transaction ? (
                    <Details
                        transaction={transaction}
                        accountsById={accountsById}
                        categoriesById={categoriesById}
                        eventsById={eventsById}
                        canEdit={canEdit}
                    />
                ) : (
                    <div className="p-8 text-sm text-muted-foreground">No transaction</div>
                )}
            </SheetContent>
        </Sheet>
    );
}

function Details({
    transaction,
    accountsById,
    categoriesById,
    eventsById,
    canEdit,
}: {
    transaction: Transaction;
    accountsById: Map<string, { name: string }>;
    categoriesById: Map<string, { name: string }>;
    eventsById: Map<string, { name: string }>;
    canEdit: boolean;
}) {
    const type = transaction.type as unknown as TxType;
    const variant = type === "income" ? "income" : type === "expense" ? "expense" : "transfer";
    const attachments = trpc.file.listForTransaction.useQuery({
        transactionId: transaction.id,
    });
    const utils = trpc.useUtils();

    const source = transaction.source_account_id
        ? accountsById.get(transaction.source_account_id)?.name
        : null;
    const destination = transaction.destination_account_id
        ? accountsById.get(transaction.destination_account_id)?.name
        : null;
    const category = transaction.expense_category_id
        ? categoriesById.get(transaction.expense_category_id)?.name
        : null;
    const event = transaction.event_id ? eventsById.get(transaction.event_id)?.name : null;
    const feeAmount =
        transaction.fee_amount != null ? Number(transaction.fee_amount) : null;
    const feeCategory =
        transaction.fee_expense_category_id != null
            ? categoriesById.get(transaction.fee_expense_category_id)?.name
            : null;
    const hasFee = feeAmount != null && feeAmount > 0;
    const sourceTotalOut =
        type === "transfer" && hasFee
            ? Number(transaction.amount) + (feeAmount ?? 0)
            : null;

    return (
        <>
            <SheetHeader className="border-b border-border p-5">
                <SheetTitle className="flex items-center gap-2">
                    Transaction details
                    <TransactionTypeBadge type={type} />
                </SheetTitle>
                <SheetDescription className="flex items-baseline justify-between">
                    <span>
                        {formatInAppTz(transaction.transaction_datetime, "MMM d, yyyy · h:mm a")}
                    </span>
                    <MoneyDisplay
                        amount={transaction.amount}
                        variant={variant as any}
                        className="text-lg font-bold"
                    />
                </SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
                <dl className="grid gap-2 text-sm">
                    {source && <Row label="From">{source}</Row>}
                    {destination && <Row label="To">{destination}</Row>}
                    {category && <Row label="Category">{category}</Row>}
                    {hasFee && (
                        <>
                            <Row label="Fee">
                                <span className="inline-flex items-center gap-2">
                                    <MoneyDisplay
                                        amount={feeAmount ?? 0}
                                        variant="expense"
                                        className="font-semibold"
                                    />
                                    {feeCategory && (
                                        <span className="text-xs text-muted-foreground">
                                            · {feeCategory}
                                        </span>
                                    )}
                                </span>
                            </Row>
                            {sourceTotalOut != null && (
                                <Row label="Source out">
                                    <MoneyDisplay
                                        amount={sourceTotalOut}
                                        variant="expense"
                                        className="font-semibold"
                                    />
                                </Row>
                            )}
                        </>
                    )}
                    {event && <Row label="Event">{event}</Row>}
                    {transaction.location && <Row label="Location">{transaction.location}</Row>}
                    {transaction.description && (
                        <Row label="Note">
                            <span className="whitespace-pre-wrap">{transaction.description}</span>
                        </Row>
                    )}
                    <Row label="Created by">
                        <span className="inline-flex items-center gap-2">
                            <UserAvatar
                                fileId={transaction.created_by_avatar_file_id}
                                firstName={transaction.created_by_first_name}
                                lastName={transaction.created_by_last_name}
                                size="xs"
                            />
                            {transaction.created_by_first_name ?? "Unknown"}{" "}
                            {transaction.created_by_last_name ?? ""}
                        </span>
                    </Row>
                </dl>

                <Separator />

                <section className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Attachments</h3>
                        {canEdit && (
                            <AttachButton
                                transactionId={transaction.id}
                                onDone={() => {
                                    void utils.file.listForTransaction.invalidate({
                                        transactionId: transaction.id,
                                    });
                                }}
                            />
                        )}
                    </div>
                    {attachments.isLoading ? (
                        <p className="text-xs text-muted-foreground">Loading…</p>
                    ) : (attachments.data?.length ?? 0) === 0 ? (
                        <p className="text-xs text-muted-foreground">
                            No attachments yet.
                        </p>
                    ) : (
                        <ul className="grid grid-cols-2 gap-3">
                            {attachments.data!.map((a) => (
                                <AttachmentCard
                                    key={a.id}
                                    fileId={a.id}
                                    mimeType={a.mimeType}
                                    name={a.originalName}
                                    transactionId={transaction.id}
                                    canRemove={canEdit}
                                    onRemoved={() => {
                                        void utils.file.listForTransaction.invalidate({
                                            transactionId: transaction.id,
                                        });
                                    }}
                                />
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[100px_1fr] items-baseline gap-3 border-b border-border/40 py-1.5 last:border-b-0">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{children}</dd>
        </div>
    );
}

function AttachButton({
    transactionId,
    onDone,
}: {
    transactionId: string;
    onDone: () => void;
}) {
    const { upload, uploading } = useFileUpload();
    const update = trpc.transaction.update.useMutation();
    const inputRef = useRef<HTMLInputElement>(null);

    const onPick = async (file: File) => {
        try {
            const fileId = await upload(file, "transaction_receipt");
            await update.mutateAsync({
                transactionId,
                addAttachmentFileIds: [fileId],
            });
            toast.success("Attachment added");
            onDone();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Upload failed");
        }
    };

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading || update.isPending}
                onClick={() => inputRef.current?.click()}
            >
                {uploading || update.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                ) : (
                    <Paperclip className="size-3" />
                )}
                Add file
            </Button>
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onPick(f);
                    e.target.value = "";
                }}
            />
        </>
    );
}

function AttachmentCard({
    fileId,
    mimeType,
    name,
    transactionId,
    canRemove,
    onRemoved,
}: {
    fileId: string;
    mimeType: string;
    name: string;
    transactionId: string;
    canRemove: boolean;
    onRemoved: () => void;
}) {
    const isImage = mimeType.startsWith("image/");
    const { url, isLoading } = useSignedUrl(fileId);
    const remove = trpc.file.removeFromTransaction.useMutation({
        onSuccess: () => {
            toast.success("Removed");
            onRemoved();
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <li className="group relative overflow-hidden rounded-md border">
            <div className="flex aspect-square items-center justify-center bg-muted/40">
                {isLoading ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : isImage && url ? (
                    <img
                        src={url}
                        alt={name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                    />
                ) : (
                    <FileText className="size-8 text-muted-foreground" />
                )}
            </div>
            <div className="flex items-center justify-between gap-1 border-t border-border bg-background/90 px-2 py-1">
                <span className="truncate text-[11px]" title={name}>
                    {name}
                </span>
                <div className="flex items-center gap-0.5">
                    {url && (
                        <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded p-1 text-muted-foreground hover:text-foreground"
                            title="Open"
                        >
                            <Download className="size-3" />
                        </a>
                    )}
                    {canRemove && (
                        <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                                remove.mutate({ transactionId, fileId })
                            }
                            disabled={remove.isPending}
                            title="Remove"
                        >
                            {remove.isPending ? (
                                <Loader2 className="size-3 animate-spin" />
                            ) : (
                                <Trash2 className="size-3" />
                            )}
                        </button>
                    )}
                </div>
            </div>
        </li>
    );
}

// Unused but kept for future expansion; the attach flow uses AttachButton.
export const _UnusedXIcon = X;
