import { useState } from "react";
import { Link2, Wallet, Check } from "lucide-react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrbitModalShell } from "@/components/orbit/OrbitModalShell";
import { OrbitFormStyles, OrbitInfoPill } from "@/components/orbit/OrbitForm";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { AccountTypeBadge } from "@/components/shared/AccountTypeBadge";
import { trpc } from "@/trpc";
import { useCurrentSpaceId } from "@/hooks/useCurrentSpace";

/**
 * Attach an account the caller already owns elsewhere to the current space.
 * Lists only accounts the user owns + that are NOT already in this space.
 */
export function AddExistingAccountDialog({
    trigger,
}: { trigger?: React.ReactNode } = {}) {
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
                {trigger ?? (
                    <Button variant="outline">
                        <Link2 />
                        Add existing
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="orbit-shell-host">
                <DialogTitle className="sr-only">Share an account with this space</DialogTitle>
                <OrbitModalShell
                    width={520}
                    eyebrow="Accounts"
                    title="Share an account"
                    subtitle="Pick one of your accounts to make it usable in this space. Transactions stay per-space — only the balance is shared."
                    leadIcon={<Link2 className="size-4" />}
                    leadColor="var(--ent-3)"
                    onClose={() => setOpen(false)}
                    footer={
                        <>
                            <button
                                type="button"
                                className="orbit-btn"
                                onClick={() => setOpen(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="orbit-btn orbit-btn-primary"
                                disabled={!selected || share.isPending}
                                onClick={() =>
                                    selected &&
                                    share.mutate({ accountId: selected, spaceId })
                                }
                            >
                                <Check className="size-3.5" />
                                {share.isPending ? "Sharing…" : "Share with space"}
                            </button>
                        </>
                    }
                >
                    <OrbitFormStyles />
                    <style>{ADD_STYLES}</style>

                    <div className="add-acc-list">
                        {listQuery.isLoading ? (
                            <div className="grid gap-2">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <Skeleton key={i} className="h-12 w-full" />
                                ))}
                            </div>
                        ) : (listQuery.data ?? []).length === 0 ? (
                            <div className="add-acc-empty">
                                <Wallet className="size-5" aria-hidden />
                                <p>
                                    You don&apos;t own any accounts that can be added
                                    here. All your accounts are already in this space.
                                </p>
                            </div>
                        ) : (
                            <div className="add-acc-rows">
                                {(listQuery.data ?? []).map((a) => {
                                    const active = selected === a.id;
                                    return (
                                        <button
                                            key={a.id}
                                            type="button"
                                            onClick={() => setSelected(a.id)}
                                            className={`add-acc-row ${active ? "is-active" : ""}`}
                                        >
                                            <EntityAvatar
                                                color={a.color}
                                                icon={a.icon}
                                                size="md"
                                            />
                                            <div className="add-acc-row-text">
                                                <div className="add-acc-row-head">
                                                    <p className="add-acc-row-name">
                                                        {a.name}
                                                    </p>
                                                    <AccountTypeBadge
                                                        type={a.accountType}
                                                    />
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
                                            {active && (
                                                <Check
                                                    className="size-4"
                                                    style={{ color: "var(--brand)" }}
                                                />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <OrbitInfoPill tone="brand">
                        Sharing only links the balance. Each space keeps its own ledger
                        of transactions for shared accounts.
                    </OrbitInfoPill>
                </OrbitModalShell>
            </DialogContent>
        </Dialog>
    );
}

const ADD_STYLES = `
.add-acc-list { max-height: 50vh; overflow-y: auto; }
.add-acc-rows { display: flex; flex-direction: column; gap: 6px; }
.add-acc-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px;
    border-radius: 10px;
    background: var(--bg-elev-1);
    border: 1px solid var(--line);
    cursor: pointer;
    text-align: left;
    color: var(--fg);
    font-family: inherit;
    transition: border-color 120ms ease, background 120ms ease;
}
.add-acc-row:hover:not(.is-active) { border-color: var(--line-strong); }
.add-acc-row.is-active {
    border-color: var(--brand);
    background: var(--brand-soft);
}
.add-acc-row-text { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.add-acc-row-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.add-acc-row-name {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0;
}
.add-acc-empty {
    padding: 32px 14px;
    color: var(--fg-3);
    text-align: center;
    font-size: 12.5px;
    line-height: 1.55;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
}
`;
