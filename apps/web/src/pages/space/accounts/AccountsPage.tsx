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
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { CreateAccountDialog } from "@/features/accounts/CreateAccountDialog";
import { ROUTES } from "@/router/routes";

export default function AccountsPage() {
    const { space } = useCurrentSpace();
    const accountsQuery = trpc.account.listBySpace.useQuery({ spaceId: space.id });

    const accounts = accountsQuery.data ?? [];
    const grouped = {
        asset: accounts.filter((a) => a.account_type === "asset"),
        liability: accounts.filter((a) => a.account_type === "liability"),
        locked: accounts.filter((a) => a.account_type === "locked"),
    };

    return (
        <div className="grid gap-5 sm:gap-6">
            <PageHeader
                title="Accounts"
                description="All accounts in this space"
                actions={
                    <PermissionGate roles={["owner"]}>
                        <CreateAccountDialog />
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
                                    {grouped[type].map((a) => (
                                        <Link
                                            key={a.id}
                                            to={ROUTES.spaceAccountDetail(space.id, a.id)}
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
                                    ))}
                                </div>
                            </div>
                        )
                    )}
                </div>
            )}
        </div>
    );
}
