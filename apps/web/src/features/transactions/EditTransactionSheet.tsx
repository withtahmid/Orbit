import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { CategoryTreeSelect } from "@/components/shared/CategoryTreeSelect";
import { TransactionTypeBadge } from "@/components/shared/TransactionTypeBadge";
import { trpc } from "@/trpc";
import { toInputDateTime, fromInputDateTime } from "@/lib/dates";

type TxType = "income" | "expense" | "transfer" | "adjustment";

export interface EditableTransaction {
    id: string;
    space_id: string;
    type: string;
    amount: string | number;
    source_account_id: string | null;
    destination_account_id: string | null;
    description: string | null;
    location: string | null;
    transaction_datetime: Date | string;
    expense_category_id: string | null;
    event_id: string | null;
}

/**
 * Edit an existing transaction. Single adaptive form: shows the fields
 * appropriate for the transaction's type (which is immutable — the CHECK
 * constraints on `transactions` don't allow changing it, so neither do we).
 *
 * For adjustment, only amount/datetime/description are editable — the
 * account pairing is decided at creation and the balance delta is
 * encoded in the sign, so editing it would require re-deriving a new
 * newBalance (out of scope here).
 */
export function EditTransactionSheet({ transaction }: { transaction: EditableTransaction }) {
    const [open, setOpen] = useState(false);
    const type = transaction.type as TxType;

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button size="icon" variant="ghost" className="size-7">
                    <Pencil className="size-3.5" />
                </Button>
            </SheetTrigger>
            <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
                <SheetHeader className="border-b border-border p-5">
                    <SheetTitle className="flex items-center gap-2">
                        Edit transaction
                        <TransactionTypeBadge type={type} />
                    </SheetTitle>
                    <SheetDescription>
                        Balances and envelope usage will recompute automatically.
                    </SheetDescription>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto p-5">
                    <EditForm
                        key={transaction.id}
                        transaction={transaction}
                        onDone={() => setOpen(false)}
                    />
                </div>
            </SheetContent>
        </Sheet>
    );
}

function EditForm({
    transaction,
    onDone,
}: {
    transaction: EditableTransaction;
    onDone: () => void;
}) {
    const spaceId = transaction.space_id;
    const type = transaction.type as TxType;
    const utils = trpc.useUtils();

    const accountsQuery = trpc.account.listBySpace.useQuery({ spaceId });
    const categoriesQuery = trpc.expenseCategory.listBySpace.useQuery({ spaceId });
    const eventsQuery = trpc.event.listBySpace.useQuery({ spaceId });

    const initialDatetime = toInputDateTime(new Date(transaction.transaction_datetime));

    const [amount, setAmount] = useState(String(transaction.amount));
    const [datetime, setDatetime] = useState(initialDatetime);
    const [description, setDescription] = useState(transaction.description ?? "");
    const [location, setLocation] = useState(transaction.location ?? "");
    const [sourceAccountId, setSource] = useState(transaction.source_account_id ?? "");
    const [destinationAccountId, setDest] = useState(
        transaction.destination_account_id ?? ""
    );
    const [categoryId, setCategoryId] = useState<string | null>(
        transaction.expense_category_id ?? null
    );
    const [eventId, setEventId] = useState(transaction.event_id ?? "");

    const mutate = trpc.transaction.update.useMutation({
        onSuccess: async () => {
            toast.success("Transaction updated");
            await utils.transaction.listBySpace.invalidate({ spaceId });
            await utils.account.listBySpace.invalidate({ spaceId });
            await utils.envelop.listBySpace.invalidate({ spaceId });
            await utils.analytics.envelopeUtilization.invalidate({ spaceId });
            await utils.analytics.spaceSummary.invalidate();
            onDone();
        },
        onError: (e) => toast.error(e.message),
    });

    const spendable = (accountsQuery.data ?? []).filter(
        (a) => a.account_type !== "locked"
    );

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const parsed = Number(amount);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            toast.error("Amount must be greater than zero");
            return;
        }
        if (type === "expense" && (!sourceAccountId || !categoryId)) {
            toast.error("Pick an account and category");
            return;
        }
        if (type === "income" && !destinationAccountId) {
            toast.error("Pick a destination account");
            return;
        }
        if (type === "transfer") {
            if (!sourceAccountId || !destinationAccountId) {
                toast.error("Pick both accounts");
                return;
            }
            if (sourceAccountId === destinationAccountId) {
                toast.error("Source and destination must differ");
                return;
            }
        }
        mutate.mutate({
            transactionId: transaction.id,
            amount: parsed,
            datetime: fromInputDateTime(datetime),
            description: description.trim() === "" ? null : description.trim(),
            location: location.trim() === "" ? null : location.trim(),
            // Only include fields that are meaningful for the transaction's
            // type. `update` merges with existing values, so undefined =
            // don't change.
            sourceAccountId:
                type === "income" || type === "adjustment"
                    ? undefined
                    : sourceAccountId || null,
            destinationAccountId:
                type === "expense" || type === "adjustment"
                    ? undefined
                    : destinationAccountId || null,
            expenseCategoryId: type === "expense" ? categoryId : undefined,
            eventId:
                type === "adjustment" ? undefined : eventId === "" ? null : eventId,
        });
    };

    const accountLabel =
        type === "income"
            ? "Into account"
            : type === "expense"
              ? "From account"
              : "From / to";

    return (
        <form className="mt-1 grid gap-4" onSubmit={submit}>
            <div className="grid gap-1.5">
                <Label htmlFor="edit-amount">Amount</Label>
                <Input
                    id="edit-amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    autoFocus
                />
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor="edit-datetime">Date &amp; time</Label>
                <Input
                    id="edit-datetime"
                    type="datetime-local"
                    value={datetime}
                    onChange={(e) => setDatetime(e.target.value)}
                />
            </div>

            {type !== "adjustment" && (
                <div className="grid gap-1.5">
                    <Label>{accountLabel}</Label>
                    {type === "income" ? (
                        <Select
                            value={destinationAccountId}
                            onValueChange={setDest}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Choose account" />
                            </SelectTrigger>
                            <SelectContent>
                                {(accountsQuery.data ?? []).map((a) => (
                                    <SelectItem key={a.id} value={a.id}>
                                        {a.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : type === "expense" ? (
                        <Select value={sourceAccountId} onValueChange={setSource}>
                            <SelectTrigger>
                                <SelectValue placeholder="Choose account" />
                            </SelectTrigger>
                            <SelectContent>
                                {spendable.map((a) => (
                                    <SelectItem key={a.id} value={a.id}>
                                        {a.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="grid gap-1.5">
                                <Label className="text-xs text-muted-foreground">
                                    From
                                </Label>
                                <Select
                                    value={sourceAccountId}
                                    onValueChange={setSource}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Source" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {spendable.map((a) => (
                                            <SelectItem key={a.id} value={a.id}>
                                                {a.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-xs text-muted-foreground">
                                    To
                                </Label>
                                <Select
                                    value={destinationAccountId}
                                    onValueChange={setDest}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Destination" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(accountsQuery.data ?? []).map((a) => (
                                            <SelectItem key={a.id} value={a.id}>
                                                {a.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {type === "expense" && (
                <div className="grid gap-1.5">
                    <Label>Category</Label>
                    <CategoryTreeSelect
                        categories={(categoriesQuery.data ?? []) as any}
                        value={categoryId}
                        onChange={setCategoryId}
                        placeholder="Choose category"
                        allowAll={false}
                    />
                </div>
            )}

            <div className="grid gap-1.5">
                <Label htmlFor="edit-desc">Description</Label>
                <Textarea
                    id="edit-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional note"
                    rows={2}
                />
            </div>

            {(type === "expense" || type === "income") && (
                <div className="grid gap-1.5">
                    <Label htmlFor="edit-location">Location (optional)</Label>
                    <Input
                        id="edit-location"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Where did this happen?"
                    />
                </div>
            )}

            {type !== "adjustment" &&
                (eventsQuery.data?.length ?? 0) > 0 && (
                    <div className="grid gap-1.5">
                        <Label>Event (optional)</Label>
                        <Select
                            value={eventId || "none"}
                            onValueChange={(v) => setEventId(v === "none" ? "" : v)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {(eventsQuery.data ?? []).map((ev) => (
                                    <SelectItem key={ev.id} value={ev.id}>
                                        {ev.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

            <Button type="submit" variant="gradient" disabled={mutate.isPending}>
                {mutate.isPending ? "Saving…" : "Save changes"}
            </Button>
        </form>
    );
}
