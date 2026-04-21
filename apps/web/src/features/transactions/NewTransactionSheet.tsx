import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { FileUploadField } from "@/components/file-upload-field";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { TransactionTypeBadge } from "@/components/shared/TransactionTypeBadge";
import { trpc } from "@/trpc";
import type { RouterOutput } from "@/trpc";
import { cn } from "@/lib/utils";
import { useCurrentSpaceId } from "@/hooks/useCurrentSpace";
import { toInputDateTime, fromInputDateTime } from "@/lib/dates";

type SpaceAccount = RouterOutput["account"]["listBySpace"][number];

const ownedByMe = (a: SpaceAccount) => a.myRole === "owner";

function AccountOption({ account }: { account: SpaceAccount }) {
    const first = account.owners?.[0];
    const extra = (account.owners?.length ?? 0) - 1;
    return (
        <span className="inline-flex items-center gap-2">
            <span>{account.name}</span>
            {first && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    ·
                    <UserAvatar
                        fileId={first.avatar_file_id}
                        firstName={first.first_name}
                        size="xs"
                    />
                    {first.first_name}
                    {extra > 0 && ` +${extra}`}
                </span>
            )}
        </span>
    );
}

type TxTab = "income" | "expense" | "transfer" | "adjustment";

const TAB_TITLE: Record<TxTab, string> = {
    income: "New income",
    expense: "New expense",
    transfer: "New transfer",
    adjustment: "Balance adjustment",
};

const TAB_TRIGGER_CLASS: Record<TxTab, string> = {
    income: "data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-600 data-[state=active]:border-emerald-500/40",
    expense: "data-[state=active]:bg-rose-500/10 data-[state=active]:text-rose-600 data-[state=active]:border-rose-500/40",
    transfer: "data-[state=active]:bg-sky-500/10 data-[state=active]:text-sky-600 data-[state=active]:border-sky-500/40",
    adjustment: "data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:border-border",
};

const TAB_BORDER_CLASS: Record<TxTab, string> = {
    income: "border-emerald-500/60",
    expense: "border-rose-500/60",
    transfer: "border-sky-500/60",
    adjustment: "border-border",
};

export function NewTransactionSheet() {
    const [open, setOpen] = useState(false);
    const [activeType, setActiveType] = useState<TxTab>("expense");
    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="gradient">
                    <Plus />
                    <span className="hidden sm:inline">New transaction</span>
                    <span className="sm:hidden">New</span>
                </Button>
            </SheetTrigger>
            <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
                <SheetHeader className="border-b border-border p-5">
                    <SheetTitle className="flex items-center gap-2">
                        {TAB_TITLE[activeType]}
                        <TransactionTypeBadge type={activeType} />
                    </SheetTitle>
                    <SheetDescription>
                        Record income, an expense, a transfer, or a balance adjustment.
                    </SheetDescription>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto p-5">
                    <Tabs
                        value={activeType}
                        onValueChange={(v) => setActiveType(v as TxTab)}
                    >
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger
                                value="income"
                                className={cn("border border-transparent", TAB_TRIGGER_CLASS.income)}
                            >
                                Income
                            </TabsTrigger>
                            <TabsTrigger
                                value="expense"
                                className={cn("border border-transparent", TAB_TRIGGER_CLASS.expense)}
                            >
                                Expense
                            </TabsTrigger>
                            <TabsTrigger
                                value="transfer"
                                className={cn("border border-transparent", TAB_TRIGGER_CLASS.transfer)}
                            >
                                Transfer
                            </TabsTrigger>
                            <TabsTrigger
                                value="adjustment"
                                className={cn(
                                    "border border-transparent",
                                    TAB_TRIGGER_CLASS.adjustment
                                )}
                            >
                                Adjust
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="income">
                            <div
                                className={cn(
                                    "border-l-4 pl-3",
                                    TAB_BORDER_CLASS.income
                                )}
                            >
                                <IncomeForm onDone={() => setOpen(false)} />
                            </div>
                        </TabsContent>
                        <TabsContent value="expense">
                            <div
                                className={cn(
                                    "border-l-4 pl-3",
                                    TAB_BORDER_CLASS.expense
                                )}
                            >
                                <ExpenseForm onDone={() => setOpen(false)} />
                            </div>
                        </TabsContent>
                        <TabsContent value="transfer">
                            <div
                                className={cn(
                                    "border-l-4 pl-3",
                                    TAB_BORDER_CLASS.transfer
                                )}
                            >
                                <TransferForm onDone={() => setOpen(false)} />
                            </div>
                        </TabsContent>
                        <TabsContent value="adjustment">
                            <div
                                className={cn(
                                    "border-l-4 pl-3",
                                    TAB_BORDER_CLASS.adjustment
                                )}
                            >
                                <AdjustmentForm onDone={() => setOpen(false)} />
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </SheetContent>
        </Sheet>
    );
}

function BaseFields({
    amount,
    setAmount,
    description,
    setDescription,
    datetime,
    setDatetime,
    location,
    setLocation,
}: {
    amount: string;
    setAmount: (v: string) => void;
    description: string;
    setDescription: (v: string) => void;
    datetime: string;
    setDatetime: (v: string) => void;
    location?: string;
    setLocation?: (v: string) => void;
}) {
    return (
        <>
            <div className="grid gap-1.5">
                <Label htmlFor="amount">Amount</Label>
                <Input
                    id="amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    placeholder="0.00"
                    autoFocus
                />
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor="datetime">Date &amp; time</Label>
                <Input
                    id="datetime"
                    type="datetime-local"
                    value={datetime}
                    onChange={(e) => setDatetime(e.target.value)}
                />
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional note"
                    rows={2}
                />
            </div>
            {setLocation && (
                <div className="grid gap-1.5">
                    <Label htmlFor="location">Location (optional)</Label>
                    <Input
                        id="location"
                        value={location ?? ""}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Where did this happen?"
                    />
                </div>
            )}
        </>
    );
}

function EventPicker({
    spaceId,
    value,
    onChange,
}: {
    spaceId: string;
    value: string;
    onChange: (v: string) => void;
}) {
    const eventsQuery = trpc.event.listBySpace.useQuery({ spaceId });
    if (!eventsQuery.data || eventsQuery.data.length === 0) return null;
    return (
        <div className="grid gap-1.5">
            <Label>Event (optional)</Label>
            <Select
                value={value || "none"}
                onValueChange={(v) => onChange(v === "none" ? "" : v)}
            >
                <SelectTrigger>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {eventsQuery.data.map((ev) => (
                        <SelectItem key={ev.id} value={ev.id}>
                            {ev.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

function defaultDateTime(): string {
    const d = new Date();
    d.setSeconds(0, 0);
    return toInputDateTime(d);
}

function IncomeForm({ onDone }: { onDone: () => void }) {
    const spaceId = useCurrentSpaceId();
    const accountsQuery = trpc.account.listBySpace.useQuery({ spaceId });
    const utils = trpc.useUtils();

    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [location, setLocation] = useState("");
    const [datetime, setDatetime] = useState(defaultDateTime());
    const [accountId, setAccountId] = useState("");
    const [eventId, setEventId] = useState("");
    const [attachmentFileIds, setAttachmentFileIds] = useState<string[]>([]);

    const mutate = trpc.transaction.income.useMutation({
        onSuccess: async () => {
            toast.success("Income recorded");
            await utils.transaction.listBySpace.invalidate({ spaceId });
            await utils.account.listBySpace.invalidate({ spaceId });
            await utils.analytics.spaceSummary.invalidate();
            onDone();
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <form
            className="mt-4 grid gap-4"
            onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (!accountId) {
                    toast.error("Pick an account");
                    return;
                }
                mutate.mutate({
                    spaceId,
                    accountId,
                    amount: Number(amount),
                    datetime: fromInputDateTime(datetime),
                    description: description || undefined,
                    location: location || undefined,
                    eventId: eventId || undefined,
                    attachmentFileIds:
                        attachmentFileIds.length > 0 ? attachmentFileIds : undefined,
                });
            }}
        >
            <BaseFields
                {...{
                    amount,
                    setAmount,
                    description,
                    setDescription,
                    datetime,
                    setDatetime,
                    location,
                    setLocation,
                }}
            />
            <div className="grid gap-1.5">
                <Label>Into account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger>
                        <SelectValue placeholder="Choose account" />
                    </SelectTrigger>
                    <SelectContent>
                        {(accountsQuery.data ?? []).map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                                <AccountOption account={a} />
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                    Income can land in any account in this space — including shared
                    pots and accounts owned by other members.
                </p>
            </div>
            <EventPicker spaceId={spaceId} value={eventId} onChange={setEventId} />
            <FileUploadField
                purpose="transaction_receipt"
                fileIds={attachmentFileIds}
                onChange={setAttachmentFileIds}
                label="Receipts"
            />
            <Button type="submit" variant="gradient" disabled={mutate.isPending}>
                {mutate.isPending ? "Saving…" : "Record income"}
            </Button>
        </form>
    );
}

function ExpenseForm({ onDone }: { onDone: () => void }) {
    const spaceId = useCurrentSpaceId();
    const accountsQuery = trpc.account.listBySpace.useQuery({ spaceId });
    const categoriesQuery = trpc.expenseCategory.listBySpace.useQuery({ spaceId });
    const utils = trpc.useUtils();

    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [location, setLocation] = useState("");
    const [datetime, setDatetime] = useState(defaultDateTime());
    const [sourceAccountId, setSource] = useState("");
    const [categoryId, setCategoryId] = useState<string | null>(null);
    const [eventId, setEventId] = useState("");
    const [attachmentFileIds, setAttachmentFileIds] = useState<string[]>([]);

    const mutate = trpc.transaction.expense.useMutation({
        onSuccess: async () => {
            toast.success("Expense recorded");
            await utils.transaction.listBySpace.invalidate({ spaceId });
            await utils.account.listBySpace.invalidate({ spaceId });
            await utils.envelop.listBySpace.invalidate({ spaceId });
            await utils.analytics.envelopeUtilization.invalidate({ spaceId });
            await utils.analytics.spaceSummary.invalidate();
            onDone();
        },
        onError: (e) => toast.error(e.message),
    });

    const availableAccounts = (accountsQuery.data ?? [])
        .filter((a) => a.account_type !== "locked")
        .filter(ownedByMe);

    return (
        <form
            className="mt-4 grid gap-4"
            onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (!sourceAccountId || !categoryId) {
                    toast.error("Pick an account and category");
                    return;
                }
                mutate.mutate({
                    spaceId,
                    sourceAccountId,
                    expense_category_id: categoryId,
                    amount: Number(amount),
                    datetime: fromInputDateTime(datetime),
                    description: description || undefined,
                    location: location || undefined,
                    eventId: eventId || undefined,
                    attachmentFileIds:
                        attachmentFileIds.length > 0 ? attachmentFileIds : undefined,
                });
            }}
        >
            <BaseFields
                {...{
                    amount,
                    setAmount,
                    description,
                    setDescription,
                    datetime,
                    setDatetime,
                    location,
                    setLocation,
                }}
            />
            <div className="grid gap-1.5">
                <Label>From account</Label>
                <Select value={sourceAccountId} onValueChange={setSource}>
                    <SelectTrigger>
                        <SelectValue placeholder="Choose account" />
                    </SelectTrigger>
                    <SelectContent>
                        {availableAccounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                                <AccountOption account={a} />
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
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
            <EventPicker spaceId={spaceId} value={eventId} onChange={setEventId} />
            <FileUploadField
                purpose="transaction_receipt"
                fileIds={attachmentFileIds}
                onChange={setAttachmentFileIds}
                label="Receipts"
            />
            <Button type="submit" variant="gradient" disabled={mutate.isPending}>
                {mutate.isPending ? "Saving…" : "Record expense"}
            </Button>
        </form>
    );
}

function TransferForm({ onDone }: { onDone: () => void }) {
    const spaceId = useCurrentSpaceId();
    const accountsQuery = trpc.account.listBySpace.useQuery({ spaceId });
    const categoriesQuery = trpc.expenseCategory.listBySpace.useQuery({ spaceId });
    const utils = trpc.useUtils();

    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [datetime, setDatetime] = useState(defaultDateTime());
    const [sourceAccountId, setSource] = useState("");
    const [destinationAccountId, setDest] = useState("");
    const [eventId, setEventId] = useState("");
    const [attachmentFileIds, setAttachmentFileIds] = useState<string[]>([]);
    // Optional fee that banks / ATMs / FX providers skim off the top.
    // When enabled, the source is debited `amount + fee` while the
    // destination still receives `amount`. The fee shows up in every
    // analytics view via its category — see project-spec §11.6.
    const [feeEnabled, setFeeEnabled] = useState(false);
    const [feeAmount, setFeeAmount] = useState("");
    const [feeCategoryId, setFeeCategoryId] = useState<string | null>(null);

    const mutate = trpc.transaction.transfer.useMutation({
        onSuccess: async () => {
            toast.success("Transfer recorded");
            await utils.transaction.listBySpace.invalidate({ spaceId });
            await utils.account.listBySpace.invalidate({ spaceId });
            await utils.envelop.listBySpace.invalidate({ spaceId });
            await utils.analytics.spaceSummary.invalidate();
            await utils.analytics.envelopeUtilization.invalidate({ spaceId });
            onDone();
        },
        onError: (e) => toast.error(e.message),
    });

    const spendable = (accountsQuery.data ?? [])
        .filter((a) => a.account_type !== "locked")
        .filter(ownedByMe);

    const feeNum = feeEnabled ? Number(feeAmount) : 0;
    const amountNum = Number(amount);
    const totalOut = (amountNum || 0) + (Number.isFinite(feeNum) ? feeNum : 0);

    return (
        <form
            className="mt-4 grid gap-4"
            onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (!sourceAccountId || !destinationAccountId) {
                    toast.error("Pick both accounts");
                    return;
                }
                if (sourceAccountId === destinationAccountId) {
                    toast.error("Source and destination must differ");
                    return;
                }
                if (feeEnabled) {
                    if (!(feeNum > 0)) {
                        toast.error("Fee must be greater than 0");
                        return;
                    }
                    if (!feeCategoryId) {
                        toast.error("Pick a category for the fee");
                        return;
                    }
                }
                mutate.mutate({
                    spaceId,
                    sourceAccountId,
                    destinationAccountId,
                    amount: Number(amount),
                    datetime: fromInputDateTime(datetime),
                    description: description || undefined,
                    eventId: eventId || undefined,
                    attachmentFileIds:
                        attachmentFileIds.length > 0 ? attachmentFileIds : undefined,
                    feeAmount: feeEnabled ? feeNum : undefined,
                    feeExpenseCategoryId:
                        feeEnabled && feeCategoryId ? feeCategoryId : undefined,
                });
            }}
        >
            <BaseFields
                {...{ amount, setAmount, description, setDescription, datetime, setDatetime }}
            />
            <div className="grid gap-1.5">
                <Label>From account</Label>
                <Select value={sourceAccountId} onValueChange={setSource}>
                    <SelectTrigger>
                        <SelectValue placeholder="Choose account" />
                    </SelectTrigger>
                    <SelectContent>
                        {spendable.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                                <AccountOption account={a} />
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="grid gap-1.5">
                <Label>To account</Label>
                <Select value={destinationAccountId} onValueChange={setDest}>
                    <SelectTrigger>
                        <SelectValue placeholder="Choose account" />
                    </SelectTrigger>
                    <SelectContent>
                        {(accountsQuery.data ?? [])
                            .filter((a) => a.id !== sourceAccountId)
                            .map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                    <AccountOption account={a} />
                                </SelectItem>
                            ))}
                    </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                    Transfers out of your money can land in any account — your own,
                    a shared household pot, or a locked savings account.
                </p>
            </div>

            {/* Optional fee block */}
            <div className="rounded-md border border-border bg-card/50 p-3">
                <label className="flex cursor-pointer items-start gap-3">
                    <input
                        type="checkbox"
                        className="mt-1"
                        checked={feeEnabled}
                        onChange={(e) => setFeeEnabled(e.target.checked)}
                    />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">There's a fee on this transfer</p>
                        <p className="text-[11px] text-muted-foreground">
                            Wire fee, ATM fee, FX margin, etc. The fee is deducted
                            from your source account on top of the transfer amount
                            and counts as a regular expense in the category you pick.
                        </p>
                    </div>
                </label>
                {feeEnabled && (
                    <div className="mt-3 grid gap-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor="fee-amount">Fee amount</Label>
                            <Input
                                id="fee-amount"
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={feeAmount}
                                onChange={(e) => setFeeAmount(e.target.value)}
                                placeholder="0.00"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Fee category</Label>
                            <CategoryTreeSelect
                                categories={(categoriesQuery.data ?? []) as any}
                                value={feeCategoryId}
                                onChange={setFeeCategoryId}
                                placeholder="Pick a category (e.g. Bank fees)"
                                allowAll={false}
                            />
                        </div>
                        {amountNum > 0 && feeNum > 0 && (
                            <div className="grid gap-1 rounded-sm bg-background/60 px-3 py-2 text-[11px]">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span>Source debited</span>
                                    <span className="font-semibold text-foreground tabular-nums">
                                        −{totalOut.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span>Destination credited</span>
                                    <span className="text-foreground tabular-nums">
                                        +{amountNum.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span>Fee (lost to provider)</span>
                                    <span className="text-expense tabular-nums">
                                        {feeNum.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <EventPicker spaceId={spaceId} value={eventId} onChange={setEventId} />
            <FileUploadField
                purpose="transaction_receipt"
                fileIds={attachmentFileIds}
                onChange={setAttachmentFileIds}
                label="Receipts"
            />
            <Button type="submit" variant="gradient" disabled={mutate.isPending}>
                {mutate.isPending ? "Saving…" : "Record transfer"}
            </Button>
        </form>
    );
}

function AdjustmentForm({ onDone }: { onDone: () => void }) {
    const spaceId = useCurrentSpaceId();
    const accountsQuery = trpc.account.listBySpace.useQuery({ spaceId });
    const utils = trpc.useUtils();

    const [accountId, setAccountId] = useState("");
    const [newBalance, setNewBalance] = useState("");
    const [description, setDescription] = useState("");
    const [datetime, setDatetime] = useState(defaultDateTime());
    const [attachmentFileIds, setAttachmentFileIds] = useState<string[]>([]);

    const mutate = trpc.transaction.adjust.useMutation({
        onSuccess: async () => {
            toast.success("Balance adjusted");
            await utils.transaction.listBySpace.invalidate({ spaceId });
            await utils.account.listBySpace.invalidate({ spaceId });
            await utils.analytics.spaceSummary.invalidate();
            onDone();
        },
        onError: (e) => toast.error(e.message),
    });

    const selected = (accountsQuery.data ?? []).find((a) => a.id === accountId);

    return (
        <form
            className="mt-4 grid gap-4"
            onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (!accountId) {
                    toast.error("Pick an account");
                    return;
                }
                mutate.mutate({
                    spaceId,
                    accountId,
                    newBalance: Number(newBalance),
                    datetime: fromInputDateTime(datetime),
                    description: description || undefined,
                    attachmentFileIds:
                        attachmentFileIds.length > 0 ? attachmentFileIds : undefined,
                });
            }}
        >
            <div className="grid gap-1.5">
                <Label>Account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger>
                        <SelectValue placeholder="Choose account" />
                    </SelectTrigger>
                    <SelectContent>
                        {(accountsQuery.data ?? []).filter(ownedByMe).map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                                <AccountOption account={a} />
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {selected && (
                    <p className="text-xs text-muted-foreground">
                        Current balance: {selected.balance}
                    </p>
                )}
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor="new-balance">New balance</Label>
                <Input
                    id="new-balance"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={newBalance}
                    onChange={(e) => setNewBalance(e.target.value)}
                    placeholder="0.00"
                    required
                />
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor="adj-datetime">Date &amp; time</Label>
                <Input
                    id="adj-datetime"
                    type="datetime-local"
                    value={datetime}
                    onChange={(e) => setDatetime(e.target.value)}
                />
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor="adj-desc">Reason (optional)</Label>
                <Textarea
                    id="adj-desc"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Why did the balance drift?"
                />
            </div>
            <FileUploadField
                purpose="transaction_receipt"
                fileIds={attachmentFileIds}
                onChange={setAttachmentFileIds}
                label="Receipts"
            />
            <Button type="submit" variant="gradient" disabled={mutate.isPending}>
                {mutate.isPending ? "Saving…" : "Adjust balance"}
            </Button>
        </form>
    );
}
