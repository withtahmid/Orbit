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
import { Input } from "@/components/ui/input";
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

export function PlanAllocateDialog({
    planId,
    defaultAccountId,
    direction,
    trigger,
}: {
    planId: string;
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

    const accountsQuery = trpc.account.listBySpace.useQuery(
        { spaceId: space.id },
        { enabled: open }
    );
    const utils = trpc.useUtils();

    const mutation = trpc.plan.allocationCreate.useMutation({
        onSuccess: async () => {
            toast.success(direction === "allocate" ? "Allocated" : "Deallocated");
            await Promise.all([
                utils.plan.allocationListBySpace.invalidate({ spaceId: space.id }),
                utils.analytics.planProgress.invalidate({ spaceId: space.id }),
                utils.analytics.spaceSummary.invalidate(),
                utils.analytics.accountAllocation.invalidate(),
            ]);
            setAmount("");
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });

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
                            ? "Move unallocated cash into this plan."
                            : "Pull money back out of this plan partition."}
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
                            planId,
                            amount: direction === "allocate" ? n : -n,
                            accountId,
                        });
                    }}
                >
                    <div className="grid gap-1.5">
                        <Label htmlFor="plan-alloc-amount">Amount</Label>
                        <Input
                            id="plan-alloc-amount"
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
                    </div>
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
