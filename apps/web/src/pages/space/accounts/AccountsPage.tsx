import { Link } from "react-router-dom";
import { Wallet, ChevronRight } from "lucide-react";
import { observer } from "mobx-react-lite";
import { PageHeader } from "@/components/shared/PageHeader";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { AccountTypeBadge } from "@/components/shared/AccountTypeBadge";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { useStore } from "@/stores/useStore";
import { useMemo } from "react";
import { CreateAccountDialog } from "@/features/accounts/CreateAccountDialog";
import { AddExistingAccountDialog } from "@/features/accounts/AddExistingAccountDialog";
import { ROUTES } from "@/router/routes";

type NormalizedOwner = {
    id: string;
    first_name: string;
    avatar_file_id: string | null;
};

type NormalizedAccount = {
    id: string;
    name: string;
    account_type: "asset" | "liability" | "locked";
    color: string;
    icon: string;
    balance: number;
    myRole: "owner" | "viewer" | null;
    owners: NormalizedOwner[];
    _spaces: null | Array<{ spaceId: string; name: string }>;
    _otherSpacesCount: number;
};

// Sentinel id used when an account has no owner rows (rare in practice
// but legal — space members can still transact against it).
const UNASSIGNED_OWNER_ID = "__unassigned__";

const AccountsPage = observer(function AccountsPage() {
    const { space } = useCurrentSpace();
    const { authStore } = useStore();
    const isPersonal = space.isPersonal;
    const currentUserId = authStore.user?.id ?? null;

    // In the virtual personal space we don't have a single "space" to
    // list accounts for — the interesting set is the accounts the
    // caller personally owns, shared out across many real spaces.
    // `account.listByUser` already returns that shape (with a per-row
    // `spaces` array) and is used by the global /accounts page; re-use
    // it here to keep a single source of truth for owned accounts.
    const accountsSpaceQuery = trpc.account.listBySpace.useQuery(
        { spaceId: space.id },
        { enabled: !isPersonal }
    );
    const accountsUserQuery = trpc.account.listByUser.useQuery(undefined, {
        enabled: isPersonal,
    });

    // Normalize to the space-shape the rest of the component renders.
    // listByUser returns `accountType` (camelCase) + `spaces` array;
    // listBySpace returns `account_type` (snake_case) + `owners` array.
    const accountsQuery = isPersonal ? accountsUserQuery : accountsSpaceQuery;
    const accounts: NormalizedAccount[] = useMemo(() => {
        if (isPersonal) {
            // Personal variant: only the caller's owned accounts are
            // shown. We synthesize an "owner" row from the current user
            // so the grouping logic below has something to key on.
            const me: NormalizedOwner | null = currentUserId
                ? {
                      id: currentUserId,
                      first_name: authStore.user?.name ?? "You",
                      avatar_file_id: authStore.user?.avatarFileId ?? null,
                  }
                : null;
            return (accountsUserQuery.data ?? [])
                .filter((a) => a.myRole === "owner")
                .map((a) => ({
                    id: a.id,
                    name: a.name,
                    account_type: a.accountType,
                    color: a.color,
                    icon: a.icon,
                    balance: a.balance,
                    myRole: a.myRole,
                    owners: me ? [me] : [],
                    _spaces: a.spaces,
                    _otherSpacesCount: a.otherSpacesCount,
                }));
        }
        return (accountsSpaceQuery.data ?? []).map((a) => ({
            ...a,
            _spaces: null,
            _otherSpacesCount: 0,
        }));
    }, [
        isPersonal,
        currentUserId,
        authStore.user?.name,
        authStore.user?.avatarFileId,
        accountsUserQuery.data,
        accountsSpaceQuery.data,
    ]);

    // Partition by primary owner so a multi-member space reads like
    // "Alice's accounts / Bob's accounts" instead of one long list.
    // Account with multiple owners is bucketed under the first one
    // (deterministic — `listBySpace` already sorts owner rows); extra
    // owners surface as the small avatar stack on the card.
    const groupedByUser = useMemo(() => {
        const byOwner = new Map<
            string,
            { owner: NormalizedOwner | null; accounts: NormalizedAccount[] }
        >();
        for (const a of accounts) {
            const primary = a.owners[0] ?? null;
            const key = primary?.id ?? UNASSIGNED_OWNER_ID;
            const bucket = byOwner.get(key);
            if (bucket) {
                bucket.accounts.push(a);
            } else {
                byOwner.set(key, { owner: primary, accounts: [a] });
            }
        }
        // Order: current user first (if present), then others by name,
        // then the unassigned bucket at the end.
        const entries = Array.from(byOwner.entries());
        entries.sort((a, b) => {
            const [aKey, aVal] = a;
            const [bKey, bVal] = b;
            if (aKey === currentUserId && bKey !== currentUserId) return -1;
            if (bKey === currentUserId && aKey !== currentUserId) return 1;
            if (aKey === UNASSIGNED_OWNER_ID) return 1;
            if (bKey === UNASSIGNED_OWNER_ID) return -1;
            const an = aVal.owner?.first_name ?? "";
            const bn = bVal.owner?.first_name ?? "";
            return an.localeCompare(bn);
        });
        return entries.map(([key, val]) => ({ key, ...val }));
    }, [accounts, currentUserId]);

    return (
        <div className="grid gap-5 sm:gap-6">
            <PageHeader
                title="Accounts"
                description={
                    isPersonal
                        ? "Every account you personally own, across all your spaces"
                        : "All accounts in this space, grouped by owner"
                }
                actions={
                    <PermissionGate roles={["owner", "editor"]}>
                        <div className="flex flex-wrap items-center gap-2">
                            <AddExistingAccountDialog />
                            <PermissionGate roles={["owner"]}>
                                <CreateAccountDialog />
                            </PermissionGate>
                        </div>
                    </PermissionGate>
                }
            />

            {accountsQuery.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 rounded-xl" />
                    ))}
                </div>
            ) : accounts.length === 0 ? (
                <EmptyState
                    icon={Wallet}
                    title="No accounts yet"
                    description="Create your first account to start tracking money."
                    action={
                        <PermissionGate roles={["owner"]}>
                            <CreateAccountDialog />
                        </PermissionGate>
                    }
                />
            ) : (
                <div className="grid gap-6">
                    {groupedByUser.map(({ key, owner, accounts: group }) => {
                        const isMe = key === currentUserId;
                        const ownerLabel =
                            key === UNASSIGNED_OWNER_ID
                                ? "Unassigned"
                                : isMe
                                  ? `${owner?.first_name ?? "You"} (you)`
                                  : owner?.first_name ?? "Unknown";
                        const total = group.reduce(
                            (acc, a) => acc + Number(a.balance),
                            0
                        );
                        return (
                            <div key={key}>
                                <div className="mb-2 flex items-center justify-between px-1">
                                    <div className="flex items-center gap-2">
                                        {owner ? (
                                            <UserAvatar
                                                fileId={owner.avatar_file_id}
                                                firstName={owner.first_name}
                                                size="sm"
                                            />
                                        ) : (
                                            <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                                <Wallet className="size-3.5" />
                                            </span>
                                        )}
                                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            {ownerLabel} ·{" "}
                                            <span className="normal-case tracking-normal">
                                                {group.length}{" "}
                                                {group.length === 1
                                                    ? "account"
                                                    : "accounts"}
                                            </span>
                                        </p>
                                    </div>
                                    <MoneyDisplay
                                        amount={total}
                                        className="text-xs font-semibold text-muted-foreground"
                                    />
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {group.map((a) => {
                                        // In the virtual personal space the account detail
                                        // can't live at /s/me/accounts/<id> — detail pages
                                        // are inherently per-space (envelope allocations,
                                        // space-scoped member management). Route to the
                                        // first real space the account is shared into; if
                                        // none are visible, fall back to the global
                                        // /accounts page which shows the same row.
                                        const href =
                                            isPersonal && a._spaces && a._spaces.length > 0
                                                ? ROUTES.spaceAccountDetail(
                                                      a._spaces[0].spaceId,
                                                      a.id
                                                  )
                                                : isPersonal
                                                  ? ROUTES.myAccounts
                                                  : ROUTES.spaceAccountDetail(
                                                        space.id,
                                                        a.id
                                                    );
                                        return (
                                            <Link
                                                key={a.id}
                                                to={href}
                                                className="group"
                                            >
                                                <Card
                                                    className="p-4 transition-all hover:-translate-y-0.5 hover:border-foreground/20"
                                                    style={{
                                                        borderTop: `3px solid ${a.color}`,
                                                    }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <EntityAvatar
                                                            color={a.color}
                                                            icon={a.icon}
                                                            size="md"
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <p className="truncate font-semibold">
                                                                    {a.name}
                                                                </p>
                                                                <AccountTypeBadge
                                                                    type={a.account_type}
                                                                />
                                                            </div>
                                                            {a.owners.length > 1 && (
                                                                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                                                    <UserAvatar
                                                                        fileId={
                                                                            a.owners[1]
                                                                                .avatar_file_id
                                                                        }
                                                                        firstName={
                                                                            a.owners[1]
                                                                                .first_name
                                                                        }
                                                                        size="xs"
                                                                    />
                                                                    <span className="truncate">
                                                                        + {a.owners[1].first_name}
                                                                        {a.owners.length > 2 &&
                                                                            ` +${a.owners.length - 2}`}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            <MoneyDisplay
                                                                amount={a.balance}
                                                                variant={
                                                                    a.account_type ===
                                                                    "liability"
                                                                        ? "expense"
                                                                        : "neutral"
                                                                }
                                                                className="block text-lg font-bold"
                                                            />
                                                        </div>
                                                        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                                                    </div>
                                                </Card>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
});

export default AccountsPage;
