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
import { trpc } from "@/trpc";
import { useCurrentSpaceId } from "@/hooks/useCurrentSpace";
import { toInputDateTime, fromInputDateTime } from "@/lib/dates";

export function NewTransactionSheet() {
    const [open, setOpen] = useState(false);
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
                    <SheetTitle>New transaction</SheetTitle>
                    <SheetDescription>
                        Record income, an expense, a transfer, or a balance adjustment.
                    </SheetDescription>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto p-5">
                    <Tabs defaultValue="expense">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="income">Income</TabsTrigger>
                            <TabsTrigger value="expense">Expense</TabsTrigger>
                            <TabsTrigger value="transfer">Transfer</TabsTrigger>
                            <TabsTrigger value="adjustment">Adjust</TabsTrigger>
                        </TabsList>
                        <TabsContent value="income">
                            <IncomeForm onDone={() => setOpen(false)} />
                        </TabsContent>
                        <TabsContent value="expense">
                            <ExpenseForm onDone={() => setOpen(false)} />
                        </TabsContent>
                        <TabsContent value="transfer">
                            <TransferForm onDone={() => setOpen(false)} />
                        </TabsContent>
                        <TabsContent value="adjustment">
                            <AdjustmentForm onDone={() => setOpen(false)} />
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
                                {a.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <EventPicker spaceId={spaceId} value={eventId} onChange={setEventId} />
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

    const availableAccounts = (accountsQuery.data ?? []).filter(
        (a) => a.account_type !== "locked"
    );

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
                                {a.name}
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
            <Button type="submit" variant="gradient" disabled={mutate.isPending}>
                {mutate.isPending ? "Saving…" : "Record expense"}
            </Button>
        </form>
    );
}

function TransferForm({ onDone }: { onDone: () => void }) {
    const spaceId = useCurrentSpaceId();
    const accountsQuery = trpc.account.listBySpace.useQuery({ spaceId });
    const utils = trpc.useUtils();

    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [datetime, setDatetime] = useState(defaultDateTime());
    const [sourceAccountId, setSource] = useState("");
    const [destinationAccountId, setDest] = useState("");
    const [eventId, setEventId] = useState("");

    const mutate = trpc.transaction.transfer.useMutation({
        onSuccess: async () => {
            toast.success("Transfer recorded");
            await utils.transaction.listBySpace.invalidate({ spaceId });
            await utils.account.listBySpace.invalidate({ spaceId });
            await utils.analytics.spaceSummary.invalidate();
            onDone();
        },
        onError: (e) => toast.error(e.message),
    });

    const spendable = (accountsQuery.data ?? []).filter(
        (a) => a.account_type !== "locked"
    );

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
                mutate.mutate({
                    spaceId,
                    sourceAccountId,
                    destinationAccountId,
                    amount: Number(amount),
                    datetime: fromInputDateTime(datetime),
                    description: description || undefined,
                    eventId: eventId || undefined,
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
                                {a.name}
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
                        {(accountsQuery.data ?? []).map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                                {a.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <EventPicker spaceId={spaceId} value={eventId} onChange={setEventId} />
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
                        {(accountsQuery.data ?? []).map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                                {a.name}
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
            <Button type="submit" variant="gradient" disabled={mutate.isPending}>
                {mutate.isPending ? "Saving…" : "Adjust balance"}
            </Button>
        </form>
    );
}
