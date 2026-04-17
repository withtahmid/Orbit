import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Wallet, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { MoneyDisplay } from "@/components/shared/MoneyDisplay";
import { AccountTypeBadge } from "@/components/shared/AccountTypeBadge";
import { trpc } from "@/trpc";
import { ROUTES } from "@/router/routes";

/**
 * Top-level "My Accounts" — global view across every space the user is in.
 * Each account shows its balance, the spaces it's shared with (as chips
 * linking into each space's account detail), and the user's role. Useful
 * when you own an account in multiple spaces and want to jump between
 * contexts without going through the space switcher first.
 */
export default function MyAccountsPage() {
    const q = trpc.account.listByUser.useQuery();

    const grouped = useMemo(() => {
        const rows = q.data ?? [];
        return {
            asset: rows.filter((a) => a.accountType === "asset"),
            liability: rows.filter((a) => a.accountType === "liability"),
            locked: rows.filter((a) => a.accountType === "locked"),
        };
    }, [q.data]);

    return (
        <div className="grid gap-5 sm:gap-6">
            <PageHeader
                title="My accounts"
                description="Every account you have access to, across all your spaces. Click a space chip to jump into its view."
            />

            {q.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-24 rounded-xl" />
                    ))}
                </div>
            ) : (q.data ?? []).length === 0 ? (
                <EmptyState
                    icon={Wallet}
                    title="You don't have any accounts"
                    description="Open a space and create your first account to start tracking money."
                />
            ) : (
                <div className="grid gap-5">
                    {(["asset", "liability", "locked"] as const).map((type) =>
                        grouped[type].length === 0 ? null : (
                            <div key={type}>
                                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    {type === "asset"
                                        ? "Assets"
                                        : type === "liability"
                                          ? "Liabilities"
                                          : "Locked"}
                                </p>
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {grouped[type].map((a) => (
                                        <Card
                                            key={a.id}
                                            className="transition-colors hover:border-foreground/20"
                                            style={{
                                                borderTop: `3px solid ${a.color}`,
                                            }}
                                        >
                                            <CardContent className="grid gap-3 p-4 sm:p-5">
                                                <div className="flex items-start gap-3">
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
                                                                type={a.accountType}
                                                            />
                                                        </div>
                                                        <MoneyDisplay
                                                            amount={a.balance}
                                                            variant={
                                                                a.accountType === "liability"
                                                                    ? "expense"
                                                                    : "neutral"
                                                            }
                                                            className="block text-lg font-bold"
                                                        />
                                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                                            Your role: {a.myRole}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="grid gap-1">
                                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                        Shared with{" "}
                                                        {a.spaces.length +
                                                            a.otherSpacesCount >
                                                        1
                                                            ? `${a.spaces.length + a.otherSpacesCount} spaces`
                                                            : "1 space"}
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {a.spaces.map((s) => (
                                                            <Link
                                                                key={s.spaceId}
                                                                to={ROUTES.spaceAccountDetail(
                                                                    s.spaceId,
                                                                    a.id
                                                                )}
                                                                className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/50 px-2 py-0.5 text-xs font-medium transition-colors hover:border-foreground/30 hover:bg-accent"
                                                            >
                                                                {s.name}
                                                                <ExternalLink className="size-3 opacity-60" />
                                                            </Link>
                                                        ))}
                                                        {a.otherSpacesCount > 0 && (
                                                            <span
                                                                className="inline-flex items-center rounded-md border border-dashed border-border bg-secondary/30 px-2 py-0.5 text-xs text-muted-foreground"
                                                                title="Spaces you're not a member of"
                                                            >
                                                                +{a.otherSpacesCount} other
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
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
