import { useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";

type Direction = "allocate" | "deallocate";

/**
 * Envelope allocate/deallocate dialog. Exposes the new (account, period)
 * scope:
 *  - Account selector: "Unassigned pool" (null) or any space account
 *  - Period selector: only shown when the envelope is monthly; defaults to
 *    "This month" and also offers "Next month"
 */
export function EnvelopeAllocateDialog({
    envelopId,
    envelopCadence,
    /** Controls whether the dialog opens already pinned to a specific account. */
    defaultAccountId,
    direction,
    trigger,
}: {
    envelopId: string;
    envelopCadence: "none" | "monthly";
    defaultAccountId?: string | null;
    direction: Direction;
    trigger?: React.ReactNode;
}) {
    const { space } = useCurrentSpace();
    const [open, setOpen] = useState(false);
    const [amount, setAmount] = useState("");
    const [accountKey, setAccountKey] = useState<string>(
        defaultAccountId === undefined ? "unassigned" : defaultAccountId ?? "unassigned"
    );
    const [periodChoice, setPeriodChoice] = useState<"this" | "next">("this");

    const accountsQuery = trpc.account.listBySpace.useQuery(
        { spaceId: space.id },
        { enabled: open }
    );
    const utils = trpc.useUtils();

    const mutation = trpc.envelop.allocationCreate.useMutation({
        onSuccess: async () => {
            toast.success(direction === "allocate" ? "Allocated" : "Deallocated");
            await Promise.all([
                utils.envelop.allocationListBySpace.invalidate({ spaceId: space.id }),
                utils.analytics.envelopeUtilization.invalidate({ spaceId: space.id }),
                utils.analytics.spaceSummary.invalidate(),
                utils.analytics.accountAllocation.invalidate(),
            ]);
            setAmount("");
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });

    const isMonthly = envelopCadence === "monthly";

    const resolvePeriodStart = (): Date | undefined => {
        if (!isMonthly) return undefined;
        const now = new Date();
        if (periodChoice === "this") {
            return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        }
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    };

    const accountId = accountKey === "unassigned" ? null : accountKey;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button variant="outline" size="sm" className="flex-1">
                        {direction === "allocate" ? (
                            <>
                                <ArrowUp className="size-3.5" />
                                Allocate
                            </>
                        ) : (
                            <>
                                <ArrowDown className="size-3.5" />
                                Deallocate
                            </>
                        )}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {direction === "allocate" ? "Allocate" : "Deallocate"} amount
                    </DialogTitle>
                    <DialogDescription>
                        {direction === "allocate"
                            ? "Move unallocated cash into this envelope."
                            : "Pull money back out of this envelope partition."}
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="grid gap-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        const n = Number(amount);
                        if (!(n > 0)) {
                            toast.error("Enter a positive amount");
                            return;
                        }
                        mutation.mutate({
                            envelopId,
                            amount: direction === "allocate" ? n : -n,
                            accountId,
                            periodStart: resolvePeriodStart(),
                        });
                    }}
                >
                    <div className="grid gap-1.5">
                        <Label htmlFor="alloc-amount" className="o-eyebrow">
                            Amount
                        </Label>
                        <div className="o-amount">
                            <input
                                id="alloc-amount"
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                autoFocus
                                required
                                className="o-amount__input"
                            />
                        </div>
                    </div>
                    <div className="grid gap-1.5">
                        <Label>From account</Label>
                        <Select value={accountKey} onValueChange={setAccountKey}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="unassigned">
                                    Unassigned (any account)
                                </SelectItem>
                                {(accountsQuery.data ?? []).map((a) => (
                                    <SelectItem key={a.id} value={a.id}>
                                        <span className="flex items-center gap-2">
                                            <EntityAvatar
                                                size="sm"
                                                color={a.color}
                                                icon={a.icon}
                                            />
                                            {a.name}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            Unassigned is a virtual pool for this envelope — use it if you
                            don&apos;t want to pin the allocation to a specific account.
                        </p>
                    </div>
                    {isMonthly && (
                        <div className="grid gap-1.5">
                            <Label>Apply to</Label>
                            <Select
                                value={periodChoice}
                                onValueChange={(v) => setPeriodChoice(v as any)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="this">This month</SelectItem>
                                    <SelectItem value="next">Next month</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <DialogFooter className="gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" variant="gradient" disabled={mutation.isPending}>
                            {mutation.isPending ? "Saving…" : "Confirm"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
