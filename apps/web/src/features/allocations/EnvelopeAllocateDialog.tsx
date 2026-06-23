import { useState, useMemo } from "react";
import { ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { useIdempotencyKey } from "@/hooks/useIdempotencyKey";
import { startOfMonth, endOfMonth, addMonths } from "@/lib/dates";
import { formatInAppTz } from "@/lib/formatDate";

type Direction = "allocate" | "deallocate";

/**
 * Envelope allocate/deallocate dialog. Account-agnostic — allocations are
 * intent (planning), so the picker for "from account" is gone. Soft
 * over-allocation is allowed; the dialog surfaces "Unbudgeted: X" inline
 * so the user can see the gap.
 */
export function EnvelopeAllocateDialog({
    envelopId,
    envelopCadence,
    direction,
    trigger,
}: {
    envelopId: string;
    envelopCadence: "none" | "monthly";
    /** Legacy prop, ignored. Kept so existing callers don't break. */
    defaultAccountId?: string | null;
    direction: Direction;
    trigger?: React.ReactNode;
}) {
    const { space } = useCurrentSpace();
    const [open, setOpen] = useState(false);
    const [amount, setAmount] = useState("");
    const [periodChoice, setPeriodChoice] = useState<"this" | "next">("this");

    const isMonthly = envelopCadence === "monthly";
    const { periodStart, periodEnd } = useMemo(() => {
        const ref = new Date();
        return {
            periodStart: startOfMonth(ref),
            periodEnd: endOfMonth(ref),
        };
    }, []);

    const summaryQuery = trpc.analytics.spaceSummary.useQuery(
        { spaceId: space.id, periodStart, periodEnd },
        { enabled: open }
    );
    const utils = trpc.useUtils();
    const idem = useIdempotencyKey();

    const mutation = trpc.envelop.allocationCreate.useMutation({
        onSuccess: async () => {
            toast.success(direction === "allocate" ? "Allocated" : "Deallocated");
            idem.rotate();
            await Promise.all([
                utils.envelop.allocationListBySpace.invalidate({ spaceId: space.id }),
                utils.analytics.envelopeUtilization.invalidate({ spaceId: space.id }),
                utils.analytics.spaceSummary.invalidate(),
            ]);
            setAmount("");
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });

    const resolvePeriodStart = (): Date | undefined => {
        if (!isMonthly) return undefined;
        // APP_TZ month-start so the row is written to the month the user
        // actually picked — native Date.UTC would land in the wrong month
        // near the UTC/APP_TZ day boundary.
        const ref = periodChoice === "this" ? new Date() : addMonths(new Date(), 1);
        return startOfMonth(ref);
    };

    const unallocated = summaryQuery.data?.unallocated ?? null;
    const numAmount = Number(amount) || 0;
    const overAllocating =
        direction === "allocate" &&
        unallocated !== null &&
        numAmount > unallocated;
    const overBy =
        overAllocating && unallocated !== null ? numAmount - unallocated : 0;

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
                            ? "Plan how much you intend to spend from this envelope."
                            : "Pull money back out of this envelope."}
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="grid gap-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (mutation.isPending) return;
                        const n = Number(amount);
                        if (!(n > 0)) {
                            toast.error("Enter a positive amount");
                            return;
                        }
                        mutation.mutate({
                            envelopId,
                            amount: direction === "allocate" ? n : -n,
                            periodStart: resolvePeriodStart(),
                            idempotencyKey: idem.key,
                        });
                    }}
                >
                    <div className="grid gap-1.5">
                        <Label htmlFor="alloc-amount">Amount</Label>
                        <Input
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
                        />
                        {direction === "allocate" && unallocated !== null && (
                            <p
                                className="text-xs"
                                style={{
                                    color: overAllocating
                                        ? "var(--expense)"
                                        : "var(--fg-3)",
                                }}
                            >
                                {overAllocating ? (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                        <AlertTriangle className="size-3" />
                                        Planning {overBy.toFixed(2)} more than
                                        currently funded. You'll need that much
                                        more income — or reduce another envelope.
                                    </span>
                                ) : (
                                    <>
                                        Unbudgeted available:{" "}
                                        <strong>{unallocated.toFixed(2)}</strong>
                                    </>
                                )}
                            </p>
                        )}
                    </div>
                    {isMonthly && (
                        <div className="grid gap-1.5">
                            <Label>Apply to</Label>
                            <Select
                                value={periodChoice}
                                onValueChange={(v) => setPeriodChoice(v as "this" | "next")}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="this">
                                        {formatInAppTz(new Date(), "MMMM")}{" "}
                                        (this month)
                                    </SelectItem>
                                    <SelectItem value="next">
                                        {formatInAppTz(addMonths(new Date(), 1), "MMMM")}{" "}
                                        (next month)
                                    </SelectItem>
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
