import { useMemo, useState, type FormEvent } from "react";
import {
    Pencil,
    ArrowDown,
    ArrowUp,
    ArrowLeftRight,
    SlidersHorizontal,
    Calendar,
    Wallet,
    Check,
} from "lucide-react";
import { toast } from "sonner";
import { OrbitDrawerShell, OrbitField } from "@/components/orbit/OrbitModalShell";
import {
    OrbitAmountCard,
    OrbitFieldRow,
    OrbitFormStyles,
    OrbitInfoPill,
    OrbitInput,
    OrbitSelect,
    OrbitTextarea,
    OrbitToggle,
    type OrbitSelectItem,
} from "@/components/orbit/OrbitForm";
import {
    Sheet,
    SheetContent,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CategoryTreeSelect } from "@/components/shared/CategoryTreeSelect";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { trpc } from "@/trpc";
import { useInvalidateAnalytics } from "@/lib/invalidate";
import type { RouterOutput } from "@/trpc";
import { toInputDateTime, fromInputDateTime } from "@/lib/dates";
import { getIcon } from "@/lib/entityIcons";

type SpaceAccount = RouterOutput["account"]["listBySpace"][number];
const ownedByMe = (a: SpaceAccount) => a.myRole === "owner";

function AccountLabel({ account }: { account: SpaceAccount }) {
    const first = account.owners?.[0];
    const extra = (account.owners?.length ?? 0) - 1;
    return (
        <span className="of-acc-label">
            <span className="of-acc-name">{account.name}</span>
            {first && (
                <span className="of-acc-meta">
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

function toAccountItem(a: SpaceAccount): OrbitSelectItem {
    const Icon = getIcon(a.icon ?? null);
    return {
        value: a.id,
        label: <AccountLabel account={a} />,
        leadIcon: <Icon className="size-3.5" />,
        leadColor: a.color ?? "var(--ent-1)",
    };
}

type TxType = "income" | "expense" | "transfer" | "adjustment";

export interface EditableTransaction {
    id: string;
    space_id: string;
    type: unknown;
    amount: string | number;
    source_account_id: string | null;
    destination_account_id: string | null;
    description: string | null;
    location: string | null;
    transaction_datetime: Date | string;
    expense_category_id: string | null;
    event_id: string | null;
    /**
     * Transfer fee columns. Both null on non-transfer rows and on
     * transfers without a fee. Both populated when the transfer
     * carries a fee.
     */
    fee_amount?: string | number | null;
    fee_expense_category_id?: string | null;
}

const EDIT_META: Record<
    TxType,
    { title: string; color: string; icon: typeof ArrowDown; tone: "fg" | "income" | "brand" | "gold" }
> = {
    expense: {
        title: "Edit expense",
        color: "var(--expense)",
        icon: ArrowUp,
        tone: "fg",
    },
    income: {
        title: "Edit income",
        color: "var(--income)",
        icon: ArrowDown,
        tone: "income",
    },
    transfer: {
        title: "Edit transfer",
        color: "var(--transfer)",
        icon: ArrowLeftRight,
        tone: "brand",
    },
    adjustment: {
        title: "Edit adjustment",
        color: "var(--gold)",
        icon: SlidersHorizontal,
        tone: "gold",
    },
};

export function EditTransactionSheet({
    transaction,
}: {
    transaction: EditableTransaction;
}) {
    const [open, setOpen] = useState(false);
    const type = transaction.type as unknown as TxType;
    const meta = EDIT_META[type];
    const LeadIcon = meta.icon;

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button size="icon" variant="ghost" className="size-7">
                    <Pencil className="size-3.5" />
                </Button>
            </SheetTrigger>
            <SheetContent
                side="right"
                className="orbit-shell-host !p-0 sm:max-w-[520px]"
            >
                <SheetTitle className="sr-only">{meta.title}</SheetTitle>
                <OrbitDrawerShell
                    eyebrow="Edit transaction"
                    title={meta.title}
                    subtitle="Balances and envelope usage will recompute automatically."
                    leadIcon={<LeadIcon className="size-4" />}
                    leadColor={meta.color}
                    onClose={() => setOpen(false)}
                    footer={
                        <>
                            <button
                                type="button"
                                className="nt-btn"
                                onClick={() => setOpen(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                form="edit-tx-form"
                                className="nt-btn nt-btn-primary"
                            >
                                <Check className="size-3.5" />
                                Save changes
                            </button>
                        </>
                    }
                >
                    <OrbitFormStyles />
                    <EditForm
                        key={transaction.id}
                        transaction={transaction}
                        onDone={() => setOpen(false)}
                    />
                </OrbitDrawerShell>
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
    const type = transaction.type as unknown as TxType;
    const meta = EDIT_META[type];
    const invalidate = useInvalidateAnalytics();

    const accountsQuery = trpc.account.listBySpace.useQuery({ spaceId });
    const categoriesQuery = trpc.expenseCategory.listBySpace.useQuery({ spaceId });
    const envelopesQuery = trpc.envelop.listBySpace.useQuery({ spaceId });
    const eventsQuery = trpc.event.listBySpace.useQuery({ spaceId });

    const initialDatetime = toInputDateTime(new Date(transaction.transaction_datetime));

    const [amount, setAmount] = useState(String(transaction.amount));
    const [datetime, setDatetime] = useState(initialDatetime);
    const [description, setDescription] = useState(transaction.description ?? "");
    const [location, setLocation] = useState(transaction.location ?? "");
    const [sourceAccountId, setSource] = useState(
        transaction.source_account_id ?? ""
    );
    const [destinationAccountId, setDest] = useState(
        transaction.destination_account_id ?? ""
    );
    const [categoryId, setCategoryId] = useState<string | null>(
        transaction.expense_category_id ?? null
    );
    const [eventId, setEventId] = useState(transaction.event_id ?? "");

    const initialFeeAmount =
        transaction.fee_amount != null ? String(transaction.fee_amount) : "";
    const [feeEnabled, setFeeEnabled] = useState(transaction.fee_amount != null);
    const [feeAmount, setFeeAmount] = useState(initialFeeAmount);
    const [feeCategoryId, setFeeCategoryId] = useState<string | null>(
        transaction.fee_expense_category_id ?? null
    );

    const allItems = useMemo(
        () => (accountsQuery.data ?? []).map(toAccountItem),
        [accountsQuery.data]
    );
    const spendableItems = useMemo(
        () =>
            (accountsQuery.data ?? [])
                .filter((a) => a.account_type !== "locked")
                .filter(ownedByMe)
                .map(toAccountItem),
        [accountsQuery.data]
    );
    const destItems = useMemo(
        () =>
            (accountsQuery.data ?? [])
                .filter((a) => a.id !== sourceAccountId)
                .map(toAccountItem),
        [accountsQuery.data, sourceAccountId]
    );

    // For edit flows: hide categories whose envelope is archived from the
    // dropdown to discourage NEW selections of them — but always preserve
    // the currently selected category (and the fee one) so the user can
    // save the transaction without rewriting an existing assignment.
    const categoriesForEdit = useMemo(() => {
        const cats = categoriesQuery.data ?? [];
        const envs = envelopesQuery.data ?? [];
        const archived = new Set(envs.filter((e) => e.archived).map((e) => e.id));
        if (archived.size === 0) return cats;
        const keep = new Set<string>();
        if (categoryId) keep.add(categoryId);
        if (feeCategoryId) keep.add(feeCategoryId);
        return cats.filter(
            (c) => !archived.has(c.envelop_id) || keep.has(c.id)
        );
    }, [categoriesQuery.data, envelopesQuery.data, categoryId, feeCategoryId]);

    const eventItems: OrbitSelectItem[] = useMemo(() => {
        const evs = eventsQuery.data ?? [];
        /* Hide closed events from the picker, but keep the one currently
           linked to this transaction (even if closed) so users editing
           an old transaction can see what it's tied to. */
        const active = evs.filter((ev) => ev.status === "active");
        const linkedClosed = transaction.event_id
            ? evs.find(
                  (ev) =>
                      ev.id === transaction.event_id && ev.status === "closed"
              )
            : null;
        const visible = linkedClosed ? [...active, linkedClosed] : active;
        return [
            { value: "__none", label: "No event" },
            ...visible.map((ev) => ({
                value: ev.id,
                label: ev.status === "closed" ? `${ev.name} (closed)` : ev.name,
                leadIcon: <Calendar className="size-3.5" />,
                leadColor: "var(--ent-5)",
            })),
        ];
    }, [eventsQuery.data, transaction.event_id]);

    const mutate = trpc.transaction.update.useMutation({
        onSuccess: async () => {
            toast.success("Transaction updated");
            await invalidate(spaceId);
            onDone();
        },
        onError: (e) => toast.error(e.message),
    });

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
        const feeNum = feeEnabled ? Number(feeAmount) : 0;
        if (type === "transfer") {
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
        }
        mutate.mutate({
            transactionId: transaction.id,
            amount: parsed,
            datetime: fromInputDateTime(datetime),
            description: description.trim() === "" ? null : description.trim(),
            location: location.trim() === "" ? null : location.trim(),
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
            feeAmount:
                type === "transfer"
                    ? feeEnabled
                        ? feeNum
                        : null
                    : undefined,
            feeExpenseCategoryId:
                type === "transfer"
                    ? feeEnabled
                        ? feeCategoryId
                        : null
                    : undefined,
        });
    };

    return (
        <form id="edit-tx-form" className="nt-form" onSubmit={submit}>
            <OrbitAmountCard
                value={amount}
                onChange={setAmount}
                tone={meta.tone}
                autoFocus
            />

            {type !== "adjustment" && (
                <OrbitField label="Date">
                    <OrbitInput
                        type="datetime-local"
                        value={datetime}
                        onChange={(e) => setDatetime(e.target.value)}
                        leadIcon={<Calendar className="size-3.5" />}
                    />
                </OrbitField>
            )}

            {type === "income" && (
                <OrbitField label="Into account" required>
                    <OrbitSelect
                        value={destinationAccountId}
                        onValueChange={setDest}
                        items={allItems}
                        placeholder="Choose account"
                        leadIcon={<Wallet className="size-3.5" />}
                        leadColor="var(--ent-1)"
                    />
                </OrbitField>
            )}

            {type === "expense" && (
                <>
                    <OrbitField label="From account" required>
                        <OrbitSelect
                            value={sourceAccountId}
                            onValueChange={setSource}
                            items={spendableItems}
                            placeholder="Choose account"
                            leadIcon={<Wallet className="size-3.5" />}
                            leadColor="var(--ent-1)"
                        />
                    </OrbitField>
                    <OrbitField
                        label="Category"
                        hint="Envelope is inferred from the category"
                        required
                    >
                        <CategoryTreeSelect
                            categories={categoriesForEdit as any}
                            value={categoryId}
                            onChange={setCategoryId}
                            placeholder="Choose category"
                            allowAll={false}
                        />
                    </OrbitField>
                </>
            )}

            {type === "transfer" && (
                <>
                    <OrbitField label="From" required>
                        <OrbitSelect
                            value={sourceAccountId}
                            onValueChange={setSource}
                            items={spendableItems}
                            placeholder="Choose source"
                            leadIcon={<Wallet className="size-3.5" />}
                            leadColor="var(--ent-1)"
                        />
                    </OrbitField>
                    <div className="nt-swap" aria-hidden>
                        <span>
                            <ArrowDown className="size-3.5" />
                        </span>
                    </div>
                    <OrbitField label="To" required>
                        <OrbitSelect
                            value={destinationAccountId}
                            onValueChange={setDest}
                            items={destItems}
                            placeholder="Choose destination"
                            leadIcon={<Wallet className="size-3.5" />}
                            leadColor="var(--ent-3)"
                        />
                    </OrbitField>

                    <OrbitToggle
                        checked={feeEnabled}
                        onChange={setFeeEnabled}
                        label="There's a fee on this transfer"
                        hint="Deducted from source on top of the amount; logged as a regular expense."
                    />

                    {feeEnabled && (
                        <OrbitFieldRow>
                            <OrbitField label="Fee amount" hint="Charged by source">
                                <OrbitInput
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step="0.01"
                                    value={feeAmount}
                                    onChange={(e) => setFeeAmount(e.target.value)}
                                    placeholder="0.00"
                                />
                            </OrbitField>
                            <OrbitField
                                label="Fee category"
                                hint="Where the fee is logged"
                            >
                                <CategoryTreeSelect
                                    categories={categoriesForEdit as any}
                                    value={feeCategoryId}
                                    onChange={setFeeCategoryId}
                                    placeholder="Pick category"
                                    allowAll={false}
                                />
                            </OrbitField>
                        </OrbitFieldRow>
                    )}
                </>
            )}

            {(type === "expense" || type === "income") && (
                <OrbitField label="Location" hint="Optional">
                    <OrbitInput
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Where did this happen?"
                    />
                </OrbitField>
            )}

            <OrbitField label="Description" hint="Optional">
                <OrbitTextarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional note"
                    rows={2}
                />
            </OrbitField>

            {type !== "adjustment" && (eventsQuery.data?.length ?? 0) > 0 && (
                <OrbitField label="Link to event" hint="Optional">
                    <OrbitSelect
                        value={eventId || "__none"}
                        onValueChange={(v) => setEventId(v === "__none" ? "" : v)}
                        items={eventItems}
                        placeholder="No event"
                    />
                </OrbitField>
            )}

            {type === "adjustment" && (
                <OrbitField label="Date">
                    <OrbitInput
                        type="datetime-local"
                        value={datetime}
                        onChange={(e) => setDatetime(e.target.value)}
                        leadIcon={<Calendar className="size-3.5" />}
                    />
                </OrbitField>
            )}

            {type === "transfer" && (
                <OrbitInfoPill tone="transfer">
                    Transfers don't show up in income/expense totals. They're recorded
                    as a paired (out, in) ledger entry.
                </OrbitInfoPill>
            )}

            {type === "adjustment" && (
                <OrbitInfoPill tone="gold">
                    Adjustments don't appear in income or expense totals — they
                    correct your account balance only.
                </OrbitInfoPill>
            )}
        </form>
    );
}
