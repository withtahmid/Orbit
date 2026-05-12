import { useState, useMemo, useEffect, type ReactNode } from "react";
import { ArrowRightLeft } from "lucide-react";
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
import { startOfMonth, endOfMonth } from "@/lib/dates";

/**
 * Move allocation between two envelopes — same period semantics as the
 * server's transfer procedure: monthly envelopes settle on their current
 * period, rolling envelopes are unscoped. The source is pre-filled
 * because the dialog is opened from a specific envelope's menu, but
 * shown read-only for clarity (one less decision).
 *
 * No money leaves any account — this only shifts planned intent.
 */
export function EnvelopeMoveDialog({
    sourceEnvelopId,
    sourceEnvelopeName,
    sourceEnvelopeColor,
    trigger,
    open: controlledOpen,
    onOpenChange,
    hideDefaultTrigger,
}: {
    sourceEnvelopId: string;
    sourceEnvelopeName: string;
    sourceEnvelopeColor?: string;
    trigger?: ReactNode;
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
    hideDefaultTrigger?: boolean;
}) {
    const { space } = useCurrentSpace();
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const open = controlledOpen ?? uncontrolledOpen;
    const setOpen = onOpenChange ?? setUncontrolledOpen;
    const [destinationId, setDestinationId] = useState("");
    const [amount, setAmount] = useState("");

    const { periodStart, periodEnd } = useMemo(() => {
        const ref = new Date();
        return {
            periodStart: startOfMonth(ref),
            periodEnd: endOfMonth(ref),
        };
    }, []);

    const utilizationQuery = trpc.analytics.envelopeUtilization.useQuery(
        { spaceId: space.id, periodStart, periodEnd },
        { enabled: open }
    );

    const utils = trpc.useUtils();
    const idem = useIdempotencyKey();
    const mutation = trpc.allocation.transfer.useMutation({
        onSuccess: async () => {
            toast.success("Moved");
            idem.rotate();
            await Promise.all([
                utils.envelop.allocationListBySpace.invalidate({
                    spaceId: space.id,
                }),
                utils.analytics.envelopeUtilization.invalidate({
                    spaceId: space.id,
                }),
                utils.analytics.spaceSummary.invalidate(),
                utils.analytics.accountAllocation.invalidate(),
            ]);
            setOpen(false);
            setAmount("");
            setDestinationId("");
        },
        onError: (e) => toast.error(e.message),
    });

    const sourceRow = utilizationQuery.data?.find(
        (e) => e.envelopId === sourceEnvelopId
    );
    const sourceRemaining = sourceRow?.remaining ?? null;

    // Destinations: every other ACTIVE envelope in the space. Archived
    // envelopes can't receive new allocations (server blocks it) so
    // showing them as options would just produce errors.
    const destinations = useMemo(
        () =>
            (utilizationQuery.data ?? []).filter(
                (e) => e.envelopId !== sourceEnvelopId && !e.archived
            ),
        [utilizationQuery.data, sourceEnvelopId]
    );

    const numAmount = Number(amount) || 0;
    const overSource =
        sourceRemaining !== null && numAmount > sourceRemaining;

    // Reset draft when reopening so the dialog doesn't surprise on second open.
    useEffect(() => {
        if (!open) {
            setAmount("");
            setDestinationId("");
        }
    }, [open]);

    const sourceColor = sourceEnvelopeColor || "var(--ent-2)";

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {!hideDefaultTrigger && (
                <DialogTrigger asChild>
                    {trigger ?? (
                        <Button variant="outline" size="sm" className="flex-1">
                            <ArrowRightLeft className="size-3.5" />
                            Move
                        </Button>
                    )}
                </DialogTrigger>
            )}
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Move allocation</DialogTitle>
                    <DialogDescription>
                        Shift planned funds between envelopes. No money
                        leaves any account.
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
                        if (!destinationId) {
                            toast.error("Pick a destination envelope");
                            return;
                        }
                        mutation.mutate({
                            amount: n,
                            from: {
                                kind: "envelop",
                                envelopId: sourceEnvelopId,
                            },
                            to: {
                                kind: "envelop",
                                envelopId: destinationId,
                            },
                            idempotencyKey: idem.key,
                        });
                    }}
                >
                    <div className="grid gap-1.5">
                        <Label>From</Label>
                        <div className="emv-pill">
                            <span
                                className="emv-pill-dot"
                                style={{ background: sourceColor }}
                            />
                            <span className="emv-pill-name">
                                {sourceEnvelopeName}
                            </span>
                            {sourceRemaining !== null && (
                                <span className="emv-pill-meta">
                                    {sourceRemaining.toFixed(2)} left
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="emv-dest">To</Label>
                        {utilizationQuery.isLoading ? (
                            <p className="emv-empty">Loading envelopes…</p>
                        ) : destinations.length === 0 ? (
                            <p className="emv-empty">
                                No other envelopes to move into. Create
                                another envelope first.
                            </p>
                        ) : (
                            <Select
                                value={destinationId}
                                onValueChange={setDestinationId}
                            >
                                <SelectTrigger id="emv-dest">
                                    <SelectValue placeholder="Choose destination envelope" />
                                </SelectTrigger>
                                <SelectContent>
                                    {destinations.map((d) => (
                                        <SelectItem
                                            key={d.envelopId}
                                            value={d.envelopId}
                                        >
                                            <span className="emv-opt">
                                                <span
                                                    className="emv-opt-dot"
                                                    style={{
                                                        background: d.color,
                                                    }}
                                                />
                                                <span className="emv-opt-name">
                                                    {d.name}
                                                </span>
                                                <span className="emv-opt-meta">
                                                    {d.remaining.toFixed(2)}{" "}
                                                    left
                                                </span>
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="emv-amount">Amount</Label>
                        <Input
                            id="emv-amount"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            autoFocus
                        />
                        {sourceRemaining !== null && (
                            <p
                                className="text-xs"
                                style={{
                                    color: overSource
                                        ? "var(--expense)"
                                        : "var(--fg-3)",
                                }}
                            >
                                {overSource
                                    ? `Exceeds ${sourceEnvelopeName}'s remaining (${sourceRemaining.toFixed(
                                          2
                                      )}). Reduce the amount or pick a different source.`
                                    : `Max: ${sourceRemaining.toFixed(
                                          2
                                      )} (${sourceEnvelopeName}'s remaining)`}
                            </p>
                        )}
                    </div>

                    <DialogFooter className="gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="gradient"
                            disabled={
                                mutation.isPending ||
                                destinations.length === 0 ||
                                !destinationId ||
                                !amount ||
                                overSource
                            }
                        >
                            {mutation.isPending ? "Moving…" : "Move"}
                        </Button>
                    </DialogFooter>
                </form>

                <style>{EMV_STYLES}</style>
            </DialogContent>
        </Dialog>
    );
}

const EMV_STYLES = `
.emv-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line-soft);
    width: 100%;
}
.emv-pill-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    flex-shrink: 0;
}
.emv-pill-name {
    font-size: 13px;
    color: var(--fg);
    font-weight: 500;
    flex: 1;
}
.emv-pill-meta {
    font-size: 11.5px;
    color: var(--fg-3);
    font-variant-numeric: tabular-nums;
}
.emv-empty {
    font-size: 12px;
    color: var(--fg-3);
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--bg-elev-2);
    border: 1px dashed var(--line);
}
.emv-opt {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: 100%;
}
.emv-opt-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    flex-shrink: 0;
}
.emv-opt-name {
    flex: 1;
    min-width: 0;
}
.emv-opt-meta {
    font-size: 11px;
    color: var(--fg-4);
    font-variant-numeric: tabular-nums;
}
`;
