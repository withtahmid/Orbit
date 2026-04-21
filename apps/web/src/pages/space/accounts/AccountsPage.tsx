import { Link } from "react-router-dom";
import { Wallet, ChevronRight } from "lucide-react";
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
import { useMemo } from "react";
import { CreateAccountDialog } from "@/features/accounts/CreateAccountDialog";
import { AddExistingAccountDialog } from "@/features/accounts/AddExistingAccountDialog";
import { ROUTES } from "@/router/routes";

export default function AccountsPage() {
    const { space } = useCurrentSpace();
    const isPersonal = space.isPersonal;

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
    // We want: id, name, account_type, color, icon, balance, myRole,
    // plus an optional `_spaces` annotation used only in the personal
    // variant to route the card click to a real space.
    const accountsQuery = isPersonal ? accountsUserQuery : accountsSpaceQuery;
    const accounts = useMemo(() => {
        if (isPersonal) {
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
                    owners: [] as Array<{
                        id: string;
                        first_name: string;
                        avatar_file_id: string | null;
                    }>,
                    _spaces: a.spaces,
                    _otherSpacesCount: a.otherSpacesCount,
                }));
        }
        return (accountsSpaceQuery.data ?? []).map((a) => ({
            ...a,
            _spaces: null as null | Array<{ spaceId: string; name: string }>,
            _otherSpacesCount: 0,
        }));
    }, [isPersonal, accountsUserQuery.data, accountsSpaceQuery.data]);
    const grouped = {
        asset: accounts.filter((a) => a.account_type === "asset"),
        liability: accounts.filter((a) => a.account_type === "liability"),
        locked: accounts.filter((a) => a.account_type === "locked"),
    };

    return (
        <div className="grid gap-5 sm:gap-6">
            <PageHeader
                title="Accounts"
                description={
                    isPersonal
                        ? "Every account you personally own, across all your spaces"
                        : "All accounts in this space"
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
                <div className="grid gap-5">
                    {(["asset", "liability", "locked"] as const).map((type) =>
                        grouped[type].length === 0 ? null : (
                            <div key={type}>
                                <div className="mb-2 flex items-center justify-between px-1">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        {type === "asset"
                                            ? "Assets"
                                            : type === "liability"
                                              ? "Liabilities"
                                              : "Locked"}
                                    </p>
                                    <MoneyDisplay
                                        amount={grouped[type].reduce(
                                            (acc, a) => acc + Number(a.balance),
                                            0
                                        )}
                                        className="text-xs font-semibold text-muted-foreground"
                                    />
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {grouped[type].map((a) => {
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
                                                        {a.owners.length > 0 && (
                                                            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                                                <UserAvatar
                                                                    fileId={
                                                                        a.owners[0].avatar_file_id
                                                                    }
                                                                    firstName={
                                                                        a.owners[0].first_name
                                                                    }
                                                                    size="xs"
                                                                />
                                                                <span className="truncate">
                                                                    {a.owners[0].first_name}
                                                                    {a.owners.length > 1 &&
                                                                        ` +${a.owners.length - 1}`}
                                                                </span>
                                                            </div>
                                                        )}
                                                        <MoneyDisplay
                                                            amount={a.balance}
                                                            variant={
                                                                a.account_type === "liability"
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
                        )
                    )}
                </div>
            )}
        </div>
    );
}
