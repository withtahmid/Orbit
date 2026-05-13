import { Link } from "react-router-dom";
import { useMemo } from "react";
import { Plus, Share2, ChevronRight } from "lucide-react";
import { observer } from "mobx-react-lite";
import { trpc } from "@/trpc";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { useStore } from "@/stores/useStore";
import { CreateAccountDialog } from "@/features/accounts/CreateAccountDialog";
import { AddExistingAccountDialog } from "@/features/accounts/AddExistingAccountDialog";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { UserAvatar } from "@/components/shared/UserAvatar";
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

const UNASSIGNED_OWNER_ID = "__unassigned__";

const AccountsPage = observer(function AccountsPage() {
    const { space } = useCurrentSpace();
    const { authStore } = useStore();
    const isPersonal = space.isPersonal;
    const currentUserId = authStore.user?.id ?? null;

    const accountsSpaceQuery = trpc.account.listBySpace.useQuery(
        { spaceId: space.id },
        { enabled: !isPersonal }
    );
    const accountsUserQuery = trpc.account.listByUser.useQuery(undefined, {
        enabled: isPersonal,
    });
    const membersQuery = trpc.space.memberList.useQuery(
        { spaceId: space.id },
        { enabled: !isPersonal }
    );

    const accountsQuery = isPersonal ? accountsUserQuery : accountsSpaceQuery;
    const accounts: NormalizedAccount[] = useMemo(() => {
        if (isPersonal) {
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

    const totals = useMemo(() => {
        let assets = 0;
        let liabilities = 0;
        let locked = 0;
        for (const a of accounts) {
            const v = Number(a.balance);
            if (a.account_type === "asset") assets += v;
            else if (a.account_type === "locked") locked += v;
            else if (a.account_type === "liability") liabilities += v;
        }
        const net = assets + locked - Math.abs(liabilities);
        return { assets, liabilities: Math.abs(liabilities), locked, net };
    }, [accounts]);

    const groupedByUser = useMemo(() => {
        const byOwner = new Map<
            string,
            { owner: NormalizedOwner | null; accounts: NormalizedAccount[] }
        >();
        for (const a of accounts) {
            const primary = a.owners[0] ?? null;
            const key = primary?.id ?? UNASSIGNED_OWNER_ID;
            const bucket = byOwner.get(key);
            if (bucket) bucket.accounts.push(a);
            else byOwner.set(key, { owner: primary, accounts: [a] });
        }
        const entries = Array.from(byOwner.entries());
        entries.sort((a, b) => {
            const [aKey, aVal] = a;
            const [bKey, bVal] = b;
            if (aKey === currentUserId && bKey !== currentUserId) return -1;
            if (bKey === currentUserId && aKey !== currentUserId) return 1;
            if (aKey === UNASSIGNED_OWNER_ID) return 1;
            if (bKey === UNASSIGNED_OWNER_ID) return -1;
            return (aVal.owner?.first_name ?? "").localeCompare(
                bVal.owner?.first_name ?? ""
            );
        });
        return entries.map(([key, val]) => ({ key, ...val }));
    }, [accounts, currentUserId]);

    const memberCount = membersQuery.data?.length ?? 0;
    const accountCount = accounts.length;

    return (
        <div className="orbit-design ac-root">
            <style>{AC_STYLES}</style>

            <header className="ac-topbar">
                <div className="ac-topbar-text">
                    <span className="eyebrow">
                        {accountCount} account{accountCount === 1 ? "" : "s"}
                        {!isPersonal && memberCount > 0
                            ? ` · ${memberCount} member${memberCount === 1 ? "" : "s"}`
                            : ""}
                        {!isPersonal ? " · 1 space" : ""}
                    </span>
                    <h1 className="display ac-title">Accounts</h1>
                    <p className="ac-sub">
                        {isPersonal
                            ? "Every account you personally own, across all your spaces."
                            : "All accounts in this space, grouped by owner."}
                    </p>
                </div>
                <div className="ac-topbar-actions">
                    <PermissionGate roles={["owner", "editor"]}>
                        <AddExistingAccountDialog
                            trigger={
                                <button type="button" className="od-btn">
                                    <Share2 className="size-3.5" /> Add existing
                                </button>
                            }
                        />
                        <PermissionGate roles={["owner"]}>
                            <CreateAccountDialog
                                trigger={
                                    <button
                                        type="button"
                                        className="od-btn od-btn-primary"
                                    >
                                        <Plus className="size-3.5" /> New account
                                    </button>
                                }
                            />
                        </PermissionGate>
                    </PermissionGate>
                </div>
            </header>

            <div className="ac-scroll">
                {/* Hero — net worth with assets/locked/liabilities */}
                <div className="od-card vignette ac-hero">
                    <div className="ac-hero-cell">
                        <span className="eyebrow">Net worth</span>
                        <span className="ac-hero-net">
                            {totals.net.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}
                        </span>
                    </div>
                    <div className="ac-hero-cell">
                        <span className="eyebrow">Assets</span>
                        <span className="ac-hero-stat" style={{ color: "var(--income)" }}>
                            {totals.assets.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}
                        </span>
                    </div>
                    <div className="ac-hero-cell">
                        <span className="eyebrow">Locked</span>
                        <span className="ac-hero-stat" style={{ color: "var(--gold)" }}>
                            {totals.locked.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}
                        </span>
                    </div>
                    <div className="ac-hero-cell">
                        <span className="eyebrow">Liabilities</span>
                        <span className="ac-hero-stat" style={{ color: "var(--expense)" }}>
                            −
                            {totals.liabilities.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}
                        </span>
                    </div>
                </div>

                {accountsQuery.isLoading ? (
                    <div className="ac-grid">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                            <Skeleton key={i} height={130} />
                        ))}
                    </div>
                ) : accounts.length === 0 ? (
                    <div className="od-card ac-empty">
                        <div
                            style={{ fontSize: 14, color: "var(--fg-2)", fontWeight: 500 }}
                        >
                            No accounts yet
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--fg-4)" }}>
                            Create your first account to start tracking money.
                        </div>
                        <PermissionGate roles={["owner"]}>
                            <CreateAccountDialog
                                trigger={
                                    <button className="od-btn od-btn-primary">
                                        <Plus className="size-3.5" /> New account
                                    </button>
                                }
                            />
                        </PermissionGate>
                    </div>
                ) : (
                    groupedByUser.map(({ key, owner, accounts: group }) => {
                        const isMe = key === currentUserId;
                        const ownerLabel =
                            key === UNASSIGNED_OWNER_ID
                                ? "Unassigned"
                                : isMe
                                  ? `${(owner?.first_name ?? "You").toUpperCase()} (YOU)`
                                  : (owner?.first_name ?? "Unknown").toUpperCase();
                        const isUnassigned = key === UNASSIGNED_OWNER_ID;
                        const total = group.reduce(
                            (acc, a) => acc + Number(a.balance),
                            0
                        );
                        return (
                            <div key={key} className="ac-group">
                                <div className="ac-group-head">
                                    <span className="ac-group-name">
                                        {isUnassigned ? (
                                            <span
                                                className="ac-owner-bubble"
                                                style={{
                                                    background:
                                                        "linear-gradient(135deg, var(--ent-1), var(--ent-2))",
                                                }}
                                                aria-hidden
                                            >
                                                ?
                                            </span>
                                        ) : (
                                            <UserAvatar
                                                fileId={owner?.avatar_file_id}
                                                firstName={owner?.first_name}
                                                size="xs"
                                                className="ac-owner-avatar-img"
                                            />
                                        )}
                                        <span className="ac-owner-label">
                                            {ownerLabel}
                                        </span>
                                        <span className="ac-owner-count">
                                            · {group.length} account
                                            {group.length === 1 ? "" : "s"}
                                        </span>
                                    </span>
                                    <span
                                        className="tabular ac-group-total"
                                        style={{
                                            color:
                                                total < 0
                                                    ? "var(--expense)"
                                                    : "var(--fg)",
                                        }}
                                    >
                                        {total.toLocaleString("en-US", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                    </span>
                                </div>
                                <div className="ac-grid">
                                    {group.map((a) => {
                                        const href =
                                            isPersonal &&
                                            a._spaces &&
                                            a._spaces.length > 0
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
                                            <AccountCard
                                                key={a.id}
                                                account={a}
                                                href={href}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
});

export default AccountsPage;

function AccountCard({
    account,
    href,
}: {
    account: NormalizedAccount;
    href: string;
}) {
    const typeChip =
        account.account_type === "liability"
            ? { label: "↑ Liability", color: "var(--expense)" }
            : account.account_type === "locked"
              ? { label: "🔒 Locked", color: "var(--gold)" }
              : { label: "↓ Asset", color: "var(--income)" };
    const otherOwnersCount = account.owners.length - 1;
    return (
        <Link
            to={href}
            className="od-card ac-card"
            style={{ borderTop: `2px solid ${account.color}` }}
        >
            <div className="ac-card-head">
                <span className="ac-card-name">
                    <Avatar
                        icon={account.icon}
                        color={account.color}
                        size={32}
                    />
                    <span className="ac-card-text">
                        <span className="ac-card-title">
                            {account.name}{" "}
                            <span
                                className="ac-card-type"
                                style={{
                                    color: typeChip.color,
                                    borderColor: `color-mix(in oklab, ${typeChip.color} 30%, transparent)`,
                                    background: `color-mix(in oklab, ${typeChip.color} 10%, transparent)`,
                                }}
                            >
                                {typeChip.label}
                            </span>
                        </span>
                    </span>
                </span>
                <ChevronRight
                    className="size-3.5"
                    style={{ color: "var(--fg-4)" }}
                />
            </div>
            <div
                className="tabular ac-card-balance"
                style={{
                    color:
                        account.account_type === "liability"
                            ? "var(--expense)"
                            : "var(--fg)",
                }}
            >
                {account.account_type === "liability" && account.balance > 0
                    ? "−"
                    : ""}
                {Math.abs(Number(account.balance)).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                })}
            </div>
            <div className="ac-card-foot">
                {account._spaces && account._spaces.length > 0 ? (
                    <span className="ac-card-spaces">
                        {account._spaces.slice(0, 3).map((s) => (
                            <span key={s.spaceId} className="ac-space-chip">
                                {s.name}
                            </span>
                        ))}
                        {account._otherSpacesCount > 0 && (
                            <span className="ac-space-chip">
                                +{account._otherSpacesCount}
                            </span>
                        )}
                    </span>
                ) : otherOwnersCount > 0 ? (
                    <span className="ac-card-shared">
                        Shared · {account.owners.length} member
                        {account.owners.length === 1 ? "" : "s"}
                    </span>
                ) : (
                    <span className="ac-card-shared">Solo</span>
                )}
            </div>
        </Link>
    );
}

function Avatar({
    icon,
    color,
    size = 32,
}: {
    icon: string;
    color: string;
    size?: number;
}) {
    return (
        <span
            style={{
                width: size,
                height: size,
                borderRadius: 8,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: `color-mix(in oklab, ${color} 18%, transparent)`,
                border: `1px solid color-mix(in oklab, ${color} 30%, transparent)`,
                color,
                flexShrink: 0,
            }}
        >
            <DesignIcon name={icon} size={size * 0.5} color={color} />
        </span>
    );
}

const ICON_PATHS: Record<string, string> = {
    home: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
    wallet:
        "M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1h2v8h-2v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm14 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
    pig: "M14 5h-3a6 6 0 0 0-6 6v1a6 6 0 0 0 6 6h6v3l3-2 1-4-2-1v-1a6 6 0 0 0-2-4M9 11h.01",
    bolt: "M13 2 3 14h7l-1 8 10-12h-7z",
    chart: "M3 21V3m18 18H3m4-4 4-6 4 4 6-8",
    book: "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM4 17a3 3 0 0 1 3-3h11",
    lock: "M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z",
    cart: "M3 4h2l3 12h11l2-8H7M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    coffee:
        "M5 8h12v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zm12 1h2a2 2 0 1 1 0 4h-2zM7 4v2M11 4v2M15 4v2",
    car: "M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13m-14 0v5h2v-2h10v2h2v-5m-14 0h14",
    dot: "M12 12h.01",
};

function DesignIcon({
    name,
    size,
    color,
}: {
    name: string;
    size: number;
    color: string;
}) {
    const d = ICON_PATHS[name] ?? ICON_PATHS.wallet;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d={d} />
        </svg>
    );
}

function Skeleton({ height = 16 }: { height?: number }) {
    return (
        <div
            style={{
                width: "100%",
                height,
                borderRadius: 12,
                background:
                    "linear-gradient(90deg, var(--bg-elev-1), var(--bg-elev-2), var(--bg-elev-1))",
                backgroundSize: "200% 100%",
                animation: "ov-shimmer 1.6s ease-in-out infinite",
            }}
        />
    );
}

const AC_STYLES = `
.ac-root {
    margin: -1.5rem -1rem;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
}
@media (min-width: 768px) {
    .ac-root { margin: -2rem; }
}

.ac-topbar {
    padding: 26px 32px 18px;
    border-bottom: 1px solid var(--line-soft);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    background: var(--bg);
    flex-wrap: wrap;
}
.ac-topbar-text { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ac-title {
    font-size: 26px;
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--fg);
    margin: 0;
}
.ac-sub { font-size: 13px; color: var(--fg-3); margin: 0; }
.ac-topbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
@media (max-width: 720px) {
    .ac-topbar { padding: 18px 18px 14px; }
}

.ac-scroll {
    flex: 1;
    padding: 22px 32px 36px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}
@media (max-width: 720px) {
    .ac-scroll { padding: 16px 18px 28px; }
}

/* Hero */
.orbit-design .od-card.ac-hero {
    padding: 28px;
    display: grid;
    grid-template-columns: 1.4fr 1fr 1fr 1fr;
    gap: 22px;
    align-items: center;
}
@media (max-width: 1100px) {
    .orbit-design .od-card.ac-hero { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
    .orbit-design .od-card.ac-hero { grid-template-columns: 1fr; }
}
.ac-hero-cell { display: flex; flex-direction: column; gap: 6px; }
.ac-hero-net {
    font-size: 48px;
    font-weight: 500;
    color: var(--fg);
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
    line-height: 1;
}
.ac-hero-stat {
    font-size: 26px;
    font-weight: 500;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
}

/* Owner group */
.ac-group { display: flex; flex-direction: column; gap: 12px; }
.ac-group-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 4px;
    gap: 12px;
}
.ac-group-name {
    display: inline-flex;
    align-items: center;
    gap: 10px;
}
.ac-owner-bubble {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: white;
    font-size: 10.5px;
    font-weight: 600;
    flex-shrink: 0;
}
.ac-owner-avatar-img { flex-shrink: 0; }
.ac-owner-label {
    font-size: 11px;
    color: var(--fg-3);
    letter-spacing: 0.1em;
    font-weight: 600;
}
.ac-owner-count {
    font-size: 11px;
    color: var(--fg-4);
    text-transform: lowercase;
}
.ac-group-total {
    font-size: 14px;
    font-weight: 500;
}

/* Card grid */
.ac-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
}
@media (max-width: 1100px) {
    .ac-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
    .ac-grid { grid-template-columns: 1fr; }
}

.orbit-design .od-card.ac-card {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    text-decoration: none;
    color: inherit;
    transition: border-color 140ms ease, background 140ms ease;
}
.orbit-design .od-card.ac-card:hover {
    border-color: var(--line-strong);
    background: var(--bg-elev-2);
}
.ac-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}
.ac-card-name {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}
.ac-card-text {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    min-width: 0;
}
.ac-card-title {
    font-size: 13.5px;
    color: var(--fg);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 8px;
}
.ac-card-type {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 7px;
    border-radius: 999px;
    border: 1px solid;
    font-size: 9.5px;
    font-weight: 500;
    letter-spacing: 0.04em;
}
.ac-card-balance {
    font-size: 24px;
    font-weight: 500;
    letter-spacing: -0.04em;
    line-height: 1;
}
.ac-card-foot { display: flex; align-items: center; }
.ac-card-spaces {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
}
.ac-space-chip {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 11px;
    color: var(--fg-3);
    background: transparent;
    border: 1px solid var(--line-soft);
}
.ac-card-shared {
    font-size: 11px;
    color: var(--fg-4);
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

/* Empty */
.orbit-design .od-card.ac-empty {
    padding: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    text-align: center;
}

/* Phone (<640px) — tighten hero, paddings, headlines. */
@media (max-width: 640px) {
    .ac-topbar { padding: 14px 14px 10px; }
    .ac-title { font-size: 22px; }
    .ac-scroll { padding: 12px 14px 22px; gap: 14px; }
    .orbit-design .od-card.ac-hero { padding: 18px; gap: 14px; }
    .ac-hero-net { font-size: 32px; }
    .ac-hero-stat { font-size: 18px; }
    .orbit-design .od-card.ac-card { padding: 14px; }
    .ac-card-balance { font-size: 20px; }
    .orbit-design .od-card.ac-empty { padding: 24px; }
}
`;
