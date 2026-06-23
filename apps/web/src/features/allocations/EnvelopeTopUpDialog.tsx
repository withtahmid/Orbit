import { useState, useMemo, useEffect, type ReactNode } from "react";
import { Coins } from "lucide-react";
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
 * Top-up dialog opened from an envelope's perspective: this envelope
 * needs more funds. Recovery option:
 *   - Pull from another envelope (uses allocation.transfer)
 *
 * Mirrors the in-transaction overspend recovery panel but available
 * outside the new-transaction flow.
 */
export function EnvelopeTopUpDialog({
    envelopId,
    envelopeName,
    envelopeColor,
    trigger,
    open: controlledOpen,
    onOpenChange,
    hideDefaultTrigger,
}: {
    envelopId: string;
    envelopeName: string;
    envelopeColor?: string;
    trigger?: ReactNode;
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
    hideDefaultTrigger?: boolean;
}) {
    const { space } = useCurrentSpace();
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const open = controlledOpen ?? uncontrolledOpen;
    const setOpen = onOpenChange ?? setUncontrolledOpen;

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

    const targetRow = utilizationQuery.data?.find(
        (e) => e.envelopId === envelopId
    );
    const remaining = targetRow?.remaining ?? null;
    const overBy = remaining !== null && remaining < 0 ? -remaining : 0;

    // Pull sources: any other ACTIVE envelope with positive remaining.
    // Archived envelopes still hold cash but pulling INTO this one is fine
    // — we just don't surface them here. The Move dialog (or manual
    // deallocate) is the explicit path to rescue cash from archived ones.
    const candidates = useMemo(
        () =>
            (utilizationQuery.data ?? []).filter(
                (e) =>
                    e.envelopId !== envelopId &&
                    e.remaining > 0 &&
                    !e.archived
            ),
        [utilizationQuery.data, envelopId]
    );

    const [pullSourceId, setPullSourceId] = useState("");
    const [pullAmount, setPullAmount] = useState("");
    // Track whether we've prefilled for the current dialog session. Without
    // this, the prefill effect re-fires on every data refresh (each time
    // `overBy` recomputes) and clobbers any amount the user has typed —
    // particularly bad after a successful Pull, when the data refresh
    // changes overBy and would overwrite a freshly-typed amount.
    const [prefilled, setPrefilled] = useState(false);

    useEffect(() => {
        if (!open) {
            setPullAmount("");
            setPullSourceId("");
            setPrefilled(false);
            return;
        }
        // Prefill exactly once per open, after data has loaded enough that
        // `remaining` is a real number (not the default 0 stand-in).
        if (!prefilled && remaining !== null) {
            const defaultAmt = overBy > 0 ? overBy.toFixed(2) : "";
            setPullAmount(defaultAmt);
            setPrefilled(true);
        }
    }, [open, prefilled, remaining, overBy]);

    const invalidate = async () => {
        await Promise.all([
            utils.envelop.allocationListBySpace.invalidate({
                spaceId: space.id,
            }),
            utils.analytics.envelopeUtilization.invalidate({
                spaceId: space.id,
            }),
            utils.analytics.spaceSummary.invalidate(),
        ]);
    };

    const pullIdem = useIdempotencyKey();
    const transferMutation = trpc.allocation.transfer.useMutation({
        onSuccess: async () => {
            toast.success("Pulled funds");
            pullIdem.rotate();
            await invalidate();
            setPullAmount("");
        },
        onError: (e) => toast.error(e.message),
    });

    const sourceMax =
        pullSourceId
            ? candidates.find((c) => c.envelopId === pullSourceId)?.remaining ?? null
            : null;
    const pullAmountNum = Number(pullAmount) || 0;
    const pullOver = sourceMax !== null && pullAmountNum > sourceMax;

    const color = envelopeColor || "var(--ent-2)";

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {!hideDefaultTrigger && (
                <DialogTrigger asChild>
                    {trigger ?? (
                        <Button variant="outline" size="sm" className="flex-1">
                            <Coins className="size-3.5" /> Top up
                        </Button>
                    )}
                </DialogTrigger>
            )}
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Top up {envelopeName}</DialogTitle>
                    <DialogDescription>
                        Pull funds from another envelope. No money leaves any
                        account.
                    </DialogDescription>
                </DialogHeader>

                <div className="etu-pill">
                    <span
                        className="etu-pill-dot"
                        style={{ background: color }}
                    />
                    <span className="etu-pill-name">{envelopeName}</span>
                    {remaining !== null && (
                        <span
                            className="etu-pill-meta tabular"
                            style={{
                                color:
                                    remaining < 0
                                        ? "var(--expense)"
                                        : "var(--fg-3)",
                            }}
                        >
                            {remaining < 0
                                ? `${overBy.toFixed(2)} over`
                                : `${remaining.toFixed(2)} left`}
                        </span>
                    )}
                </div>

                <div className="etu-recover-card">
                    <div className="etu-recover-card-head">
                        <span className="etu-recover-card-title">
                            Pull from another envelope
                        </span>
                        <span className="etu-recover-card-hint">
                            Move planned funds from another bucket into{" "}
                            {envelopeName}.
                        </span>
                    </div>

                    {utilizationQuery.isLoading ? (
                        <p className="etu-empty">Loading envelopes…</p>
                    ) : candidates.length === 0 ? (
                        <p className="etu-empty">
                            No other envelopes have remaining funds to pull
                            from.
                        </p>
                    ) : (
                        <div className="etu-fields">
                            <Select
                                value={pullSourceId}
                                onValueChange={setPullSourceId}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose source envelope…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {candidates.map((c) => (
                                        <SelectItem
                                            key={c.envelopId}
                                            value={c.envelopId}
                                        >
                                            <span className="etu-opt">
                                                <span
                                                    className="etu-opt-dot"
                                                    style={{
                                                        background: c.color,
                                                    }}
                                                />
                                                <span className="etu-opt-name">
                                                    {c.name}
                                                </span>
                                                <span className="etu-opt-meta tabular">
                                                    {c.remaining.toFixed(2)}{" "}
                                                    left
                                                </span>
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="etu-amt-row">
                                <Input
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step="0.01"
                                    value={pullAmount}
                                    onChange={(e) =>
                                        setPullAmount(e.target.value)
                                    }
                                    placeholder="0.00"
                                />
                                <Button
                                    type="button"
                                    variant="gradient"
                                    disabled={
                                        !pullSourceId ||
                                        !pullAmount ||
                                        pullAmountNum <= 0 ||
                                        pullOver ||
                                        transferMutation.isPending
                                    }
                                    onClick={() =>
                                        transferMutation.mutate({
                                            amount: pullAmountNum,
                                            from: {
                                                envelopId: pullSourceId,
                                            },
                                            to: {
                                                envelopId,
                                            },
                                            idempotencyKey: pullIdem.key,
                                        })
                                    }
                                >
                                    {transferMutation.isPending
                                        ? "Pulling…"
                                        : pullAmountNum > 0
                                          ? `Pull ${pullAmountNum.toFixed(2)}`
                                          : "Pull"}
                                </Button>
                            </div>
                            {sourceMax !== null && (
                                <p
                                    className="etu-hint"
                                    style={{
                                        color: pullOver
                                            ? "var(--expense)"
                                            : "var(--fg-3)",
                                    }}
                                >
                                    {pullOver
                                        ? `Exceeds source's remaining (${sourceMax.toFixed(
                                              2
                                          )}).`
                                        : `Max: ${sourceMax.toFixed(2)}`}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpen(false)}
                    >
                        Done
                    </Button>
                </DialogFooter>

                <style>{ETU_STYLES}</style>
            </DialogContent>
        </Dialog>
    );
}

const ETU_STYLES = `
.etu-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line-soft);
    width: 100%;
}
.etu-pill-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    flex-shrink: 0;
}
.etu-pill-name {
    font-size: 13px;
    color: var(--fg);
    font-weight: 500;
    flex: 1;
}
.etu-pill-meta {
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
}

.etu-recover-card {
    background: var(--bg-elev-1);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: border-color 140ms ease;
}
.etu-recover-card:hover {
    border-color: var(--line-strong);
}
.etu-recover-card-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.etu-recover-card-title {
    font-size: 12.5px;
    color: var(--fg);
    font-weight: 500;
    line-height: 1.3;
}
.etu-recover-card-hint {
    font-size: 11px;
    color: var(--fg-4);
    line-height: 1.4;
}
.etu-fields {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.etu-amt-row {
    display: flex;
    gap: 8px;
    align-items: stretch;
}
.etu-amt-row > input {
    flex: 1;
    min-width: 0;
}
.etu-amt-row > button {
    flex-shrink: 0;
    white-space: nowrap;
}
.etu-empty {
    font-size: 12px;
    color: var(--fg-3);
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--bg-elev-2);
    border: 1px dashed var(--line);
    margin: 0;
}
.etu-hint {
    font-size: 11px;
    margin: 0;
}
.etu-opt {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: 100%;
}
.etu-opt-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    flex-shrink: 0;
}
.etu-opt-name {
    flex: 1;
    min-width: 0;
}
.etu-opt-meta {
    font-size: 11px;
    color: var(--fg-4);
}
@media (max-width: 480px) {
    .etu-amt-row {
        flex-direction: column;
    }
}
`;
