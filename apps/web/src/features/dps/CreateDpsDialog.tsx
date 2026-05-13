import { useState } from "react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/trpc";
import { useIdempotencyKey } from "@/hooks/useIdempotencyKey";
import { toInputDate } from "@/lib/dates";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    spaceId: string;
    /** Real accounts in the space the user could auto-debit from. */
    sourceAccountOptions: { id: string; name: string }[];
    onCreated?: (schemeId: string) => void;
}

export function CreateDpsDialog({
    open,
    onOpenChange,
    spaceId,
    sourceAccountOptions,
    onCreated,
}: Props) {
    const { key, rotate } = useIdempotencyKey();
    const utils = trpc.useUtils();

    const [bankName, setBankName] = useState("");
    const [schemeName, setSchemeName] = useState("");
    const [accountNumber, setAccountNumber] = useState("");
    const [installmentAmount, setInstallmentAmount] = useState("");
    const [termMonths, setTermMonths] = useState("60");
    const [annualRatePct, setAnnualRatePct] = useState("8");
    const [compounding, setCompounding] = useState<"monthly" | "quarterly">(
        "quarterly"
    );
    const [startDate, setStartDate] = useState(toInputDate(new Date()));
    const [installmentDay, setInstallmentDay] = useState("");
    const [sourceAccountId, setSourceAccountId] = useState<string>("");
    const [withholdingPct, setWithholdingPct] = useState("10");
    const [notes, setNotes] = useState("");

    const mut = trpc.dps.create.useMutation({
        onSuccess: (res) => {
            toast.success("DPS scheme added");
            rotate();
            utils.dps.listBySpace.invalidate({ spaceId });
            utils.personal.dps.list.invalidate();
            utils.personal.dps.totals.invalidate();
            utils.personal.dps.upcomingInstallments.invalidate();
            onCreated?.(res!.schemeId);
            onOpenChange(false);
            // Reset form for next time.
            setBankName("");
            setSchemeName("");
            setAccountNumber("");
            setInstallmentAmount("");
            setTermMonths("60");
            setAnnualRatePct("8");
            setCompounding("quarterly");
            setStartDate(toInputDate(new Date()));
            setInstallmentDay("");
            setSourceAccountId("");
            setWithholdingPct("10");
            setNotes("");
        },
        onError: (err) => toast.error(err.message),
    });

    const handleSubmit = () => {
        const amount = Number(installmentAmount);
        const term = Number(termMonths);
        const rateBps = Math.round(Number(annualRatePct) * 100);
        const withholdingBps = Math.round(Number(withholdingPct) * 100);

        if (!bankName.trim()) return toast.error("Bank name is required");
        if (!Number.isFinite(amount) || amount <= 0)
            return toast.error("Installment amount must be positive");
        if (!Number.isInteger(term) || term <= 0)
            return toast.error("Term must be a positive integer");
        if (!Number.isFinite(rateBps) || rateBps <= 0)
            return toast.error("Rate must be positive");
        if (!startDate) return toast.error("Start date is required");

        const dom = installmentDay ? Number(installmentDay) : undefined;
        if (dom !== undefined && (dom < 1 || dom > 31))
            return toast.error("Installment day must be 1–31");

        mut.mutate({
            spaceId,
            bankName: bankName.trim(),
            schemeName: schemeName.trim() || undefined,
            accountNumber: accountNumber.trim() || undefined,
            installmentAmount: amount,
            termMonths: term,
            annualRateBps: rateBps,
            compounding,
            startDate: new Date(startDate),
            installmentDay: dom,
            sourceAccountId: sourceAccountId || undefined,
            withholdingTaxBps: withholdingBps,
            notes: notes.trim() || undefined,
            idempotencyKey: key,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogTitle>New DPS scheme</DialogTitle>
                <DialogDescription>
                    Track a recurring deposit contract. Principal lives in a
                    new locked account; the monthly installment is recorded as
                    a transfer.
                </DialogDescription>
                <div className="grid gap-3 py-2">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="dps-bank">Bank</Label>
                            <Input
                                id="dps-bank"
                                value={bankName}
                                onChange={(e) => setBankName(e.target.value)}
                                placeholder="DBBL"
                            />
                        </div>
                        <div>
                            <Label htmlFor="dps-scheme">Scheme name (optional)</Label>
                            <Input
                                id="dps-scheme"
                                value={schemeName}
                                onChange={(e) => setSchemeName(e.target.value)}
                                placeholder="5y · 8%"
                            />
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="dps-acct-no">Account number (optional)</Label>
                        <Input
                            id="dps-acct-no"
                            value={accountNumber}
                            onChange={(e) => setAccountNumber(e.target.value)}
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <Label htmlFor="dps-installment">Installment (BDT)</Label>
                            <Input
                                id="dps-installment"
                                type="number"
                                inputMode="decimal"
                                value={installmentAmount}
                                onChange={(e) =>
                                    setInstallmentAmount(e.target.value)
                                }
                            />
                        </div>
                        <div>
                            <Label htmlFor="dps-term">Term (months)</Label>
                            <Input
                                id="dps-term"
                                type="number"
                                value={termMonths}
                                onChange={(e) => setTermMonths(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="dps-rate">Rate (% / yr)</Label>
                            <Input
                                id="dps-rate"
                                type="number"
                                step="0.01"
                                value={annualRatePct}
                                onChange={(e) => setAnnualRatePct(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <Label>Compounding</Label>
                            <Select
                                value={compounding}
                                onValueChange={(v) =>
                                    setCompounding(v as "monthly" | "quarterly")
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="quarterly">Quarterly</SelectItem>
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="dps-start">Start date</Label>
                            <Input
                                id="dps-start"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="dps-day">Installment day (1–31)</Label>
                            <Input
                                id="dps-day"
                                type="number"
                                min={1}
                                max={31}
                                value={installmentDay}
                                onChange={(e) => setInstallmentDay(e.target.value)}
                                placeholder="Auto"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>Auto-debit account (optional)</Label>
                            <Select
                                value={sourceAccountId}
                                onValueChange={(v) => setSourceAccountId(v)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="None" />
                                </SelectTrigger>
                                <SelectContent>
                                    {sourceAccountOptions.map((a) => (
                                        <SelectItem key={a.id} value={a.id}>
                                            {a.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="dps-tax">Withholding tax (% of interest)</Label>
                            <Input
                                id="dps-tax"
                                type="number"
                                step="0.1"
                                value={withholdingPct}
                                onChange={(e) => setWithholdingPct(e.target.value)}
                            />
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="dps-notes">Notes (optional)</Label>
                        <Input
                            id="dps-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={mut.isPending}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={mut.isPending}>
                        {mut.isPending ? "Adding…" : "Add DPS"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
