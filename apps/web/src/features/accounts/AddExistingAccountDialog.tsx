import { useState } from "react";
import { Link2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { AccountTypeBadge } from "@/components/shared/AccountTypeBadge";
import { trpc } from "@/trpc";
import { useCurrentSpaceId } from "@/hooks/useCurrentSpace";
import { cn } from "@/lib/utils";

/**
 * Attach an account the caller already owns elsewhere to the current space.
 * Lists only accounts the user owns + that are NOT already in this space.
 */
export function AddExistingAccountDialog() {
    const spaceId = useCurrentSpaceId();
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const utils = trpc.useUtils();

    const listQuery = trpc.account.listShareableForSpace.useQuery(
        { spaceId },
        { enabled: open }
    );

    const share = trpc.account.shareWithSpace.useMutation({
        onSuccess: async () => {
            toast.success("Account shared with this space");
            await Promise.all([
                utils.account.listBySpace.invalidate({ spaceId }),
                utils.account.listByUser.invalidate(),
            ]);
            setSelected(null);
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <Link2 />
                    Add existing
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Share an account with this space</DialogTitle>
                    <DialogDescription>
                        Pick one of your accounts to make it usable in this space.
                        Transactions stay per-space &mdash; only the balance is shared.
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-[50vh] overflow-y-auto">
                    {listQuery.isLoading ? (
                        <div className="grid gap-2">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : (listQuery.data ?? []).length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            You don&apos;t own any accounts that can be added here. All
                            your accounts are already in this space.
                        </p>
                    ) : (
                        <div className="grid gap-1.5">
                            {(listQuery.data ?? []).map((a) => {
                                const active = selected === a.id;
                                return (
                                    <button
                                        key={a.id}
                                        type="button"
                                        onClick={() => setSelected(a.id)}
                                        className={cn(
                                            "flex w-full items-center gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-foreground/30",
                                            active &&
                                                "border-primary/60 bg-primary/5"
                                        )}
                                    >
                                        <EntityAvatar
                                            color={a.color}
                                            icon={a.icon}
                                            size="md"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="truncate font-medium">
                                                    {a.name}
                                                </p>
                                                <AccountTypeBadge type={a.accountType} />
                                            </div>
                                            <MoneyDisplay
                                                amount={a.balance}
                                                variant={
                                                    a.accountType === "liability"
                                                        ? "expense"
                                                        : "muted"
                                                }
                                                className="text-xs"
                                            />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
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
                        variant="gradient"
                        disabled={!selected || share.isPending}
                        onClick={() =>
                            selected &&
                            share.mutate({ accountId: selected, spaceId })
                        }
                    >
                        {share.isPending ? "Sharing…" : "Share with space"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
