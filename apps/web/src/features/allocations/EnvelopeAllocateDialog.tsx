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
    // Pull this envelope's current period balance so we can warn when it's
    // already overspent. Allocating to cover PAST overspend is pure relabeling
    // — the cash already left the accounts — so it won't move Unbudgeted. The
    // page usually has this cached, so this is normally free.
    const utilizationQuery = trpc.analytics.envelopeUtilization.useQuery(
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

    // How far this envelope is already overspent this period (consumed −
    // allocated, > 0 only when over). Allocating up to this much is "covering
    // past overspend" and will NOT change the Unbudgeted pool, because that
    // cash is already gone from the accounts. Only the portion ABOVE the
    // overspend becomes real forward funding that holds cash.
    const thisEnv = useMemo(
        () => utilizationQuery.data?.find((e) => e.envelopId === envelopId),
        [utilizationQuery.data, envelopId]
    );
    // `utilizationQuery` is pinned to the CURRENT month, so its overspend is
    // only meaningful when we're allocating to this period. Allocating to next
    // month funds a fresh period with no past overspend — the whole amount is
    // real forward funding — so suppress the covering-overspend logic there.
    const allocatingToNext = isMonthly && periodChoice === "next";
    const alreadyOverspentBy =
        thisEnv != null && !allocatingToNext
            ? Math.max(0, thisEnv.consumed - thisEnv.allocated)
            : 0;
    const coveringPastOverspend =
        direction === "allocate" && alreadyOverspentBy > 0;
    const amountCoveringOverspend = Math.min(numAmount, alreadyOverspentBy);

    // Only the portion that actually holds cash can draw down Unbudgeted; the
    // part that merely covers past overspend moves nothing (that cash already
    // left the accounts). Netting it out keeps this warning consistent with the
    // covering-overspend note below — otherwise the dialog could claim both
    // "won't change your pool" and "you're over-allocating" at the same time.
    const holdingPortion = Math.max(0, numAmount - amountCoveringOverspend);
    const overAllocating =
        direction === "allocate" &&
        unallocated !== null &&
        holdingPortion > unallocated;
    const overBy =
        overAllocating && unallocated !== null ? holdingPortion - unallocated : 0;

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
                                        <AlertTriangle className="size-3" aria-hidden />
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
                        {coveringPastOverspend && (
                            <p
                                className="text-xs"
                                style={{
                                    color: "var(--fg-3)",
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: 6,
                                    background:
                                        "color-mix(in oklab, var(--expense) 8%, transparent)",
                                    border: "1px solid color-mix(in oklab, var(--expense) 18%, transparent)",
                                    borderRadius: 8,
                                    padding: "7px 9px",
                                }}
                            >
                                <AlertTriangle
                                    className="size-3 shrink-0"
                                    aria-hidden
                                    style={{ marginTop: 2 }}
                                />
                                <span>
                                    This envelope is already overspent by{" "}
                                    <strong>
                                        {alreadyOverspentBy.toFixed(2)}
                                    </strong>
                                    . That cash already left your accounts, so
                                    {numAmount > 0 ? (
                                        <>
                                            {" "}
                                            the first{" "}
                                            <strong>
                                                {amountCoveringOverspend.toFixed(
                                                    2
                                                )}
                                            </strong>{" "}
                                            you allocate just covers it on paper
                                            and won't change your Unbudgeted
                                            pool.
                                        </>
                                    ) : (
                                        <>
                                            {" "}
                                            allocating to cover it won't change
                                            your Unbudgeted pool.
                                        </>
                                    )}
                                </span>
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
