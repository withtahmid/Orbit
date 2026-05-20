import { Link, useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { trpc } from "@/trpc";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";
import { PERSONAL_SPACE_ID, PERSONAL_SPACE_NAME } from "@/lib/personalSpace";
import { OrbitLogo } from "@/components/orbit/OrbitLogo";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { CreateSpaceDialog } from "@/features/spaces/CreateSpaceDialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SpaceSelectorPage = observer(function SpaceSelectorPage() {
    const { authStore } = useStore();
    const navigate = useNavigate();
    const user = authStore.user;
    const userName = user?.name ?? "You";
    // Single name field → split for UserAvatar's initials fallback. Same
    // convention as AppShellLayout and SpaceLayout.
    const [firstName, ...rest] = userName.split(" ");
    const lastName = rest.join(" ");

    const spacesQuery = trpc.space.list.useQuery();
    const personalSummary = trpc.personal.summary.useQuery({
        periodStart: startOfMonth(new Date()),
        periodEnd: endOfMonth(new Date()),
    });

    const spaces = spacesQuery.data ?? [];
    const memberCount = (personalSummary.data?.memberSpacesCount ?? 0) + 1;
    const personalNet = personalSummary.data?.totalBalance ?? null;

    return (
        <div className="orbit-design ss-root">
            <style>{SS_STYLES}</style>

            <header className="ss-header">
                <Link to={ROUTES.root} style={{ textDecoration: "none" }}>
                    <OrbitLogo size={24} />
                </Link>
                <DropdownMenu>
                    <DropdownMenuTrigger className="ss-userchip" aria-label={userName}>
                        <UserAvatar
                            fileId={user?.avatarFileId}
                            firstName={firstName}
                            lastName={lastName}
                            size="sm"
                            className="ss-avatar-img"
                        />
                        <span style={{ fontSize: 13, color: "var(--fg)" }}>
                            {userName}
                        </span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                            onClick={() => navigate(ROUTES.profile)}
                        >
                            Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => navigate(ROUTES.security)}
                        >
                            Security
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => {
                                authStore.clearAuth();
                                navigate(ROUTES.login, { replace: true });
                            }}
                        >
                            Log out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </header>

            <div className="ss-body">
                <div className="ss-intro">
                    <span className="eyebrow">Where to today?</span>
                    <h1 className="display ss-title">Pick a space</h1>
                    <p className="ss-lede">
                        You&apos;re a member of {memberCount} space
                        {memberCount === 1 ? "" : "s"}. Spaces hold shared
                        envelopes and transactions.
                    </p>
                </div>

                <div className="ss-grid">
                    {/* Personal "My money" card — always first, gold accent. */}
                    <Link
                        to={ROUTES.space(PERSONAL_SPACE_ID)}
                        className="od-card od-rise ss-card ss-card-personal"
                    >
                        <span className="ss-card-radial" aria-hidden />
                        <div className="ss-card-top">
                            <span
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 14,
                                }}
                            >
                                <SpaceAvatar
                                    icon="sparkle"
                                    colorVar="var(--gold)"
                                    size={44}
                                />
                                <span className="ss-card-name">
                                    <span className="display ss-card-title">
                                        {PERSONAL_SPACE_NAME}
                                    </span>
                                    <span className="ss-card-sub">
                                        Personal · all spaces unioned
                                    </span>
                                </span>
                            </span>
                            <ChevronRight />
                        </div>
                        <div className="ss-card-bottom">
                            <div>
                                <span className="eyebrow">Net worth</span>
                                <div className="ss-money">
                                    {personalNet !== null
                                        ? formatMoney(personalNet)
                                        : "—"}
                                </div>
                            </div>
                            <div className="ss-members">
                                <span
                                    className="ss-member"
                                    style={{
                                        background: "var(--ent-1)",
                                    }}
                                >
                                    {(firstName?.[0] ?? "?").toUpperCase()}
                                </span>
                            </div>
                        </div>
                    </Link>

                    {spacesQuery.isLoading ? (
                        <>
                            <SkeletonCard />
                            <SkeletonCard />
                        </>
                    ) : (
                        spaces.map((s, i) => {
                            const ent = `var(--ent-${(i % 6) + 1})`;
                            const icon = REAL_SPACE_ICONS[i % REAL_SPACE_ICONS.length];
                            return (
                                <Link
                                    key={s.id}
                                    to={ROUTES.space(s.id)}
                                    className="od-card od-rise ss-card"
                                >
                                    <div className="ss-card-top">
                                        <span
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 14,
                                            }}
                                        >
                                            <SpaceAvatar
                                                icon={icon}
                                                colorVar={ent}
                                                size={44}
                                            />
                                            <span className="ss-card-name">
                                                <span className="display ss-card-title">
                                                    {s.name}
                                                </span>
                                                <span className="ss-card-sub">
                                                    Shared · {titleCase(s.myRole)}
                                                </span>
                                            </span>
                                        </span>
                                        <ChevronRight />
                                    </div>
                                    <div className="ss-card-bottom">
                                        <div>
                                            <span className="eyebrow">
                                                Your role
                                            </span>
                                            <div className="ss-money">
                                                {titleCase(s.myRole)}
                                            </div>
                                        </div>
                                        <div className="ss-members">
                                            {[0, 1, 2].map((j) => (
                                                <span
                                                    key={j}
                                                    className="ss-member"
                                                    style={{
                                                        background: `var(--ent-${((i + j) % 6) + 1})`,
                                                    }}
                                                >
                                                    {String.fromCharCode(
                                                        65 + ((i + j) % 26)
                                                    )}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </Link>
                            );
                        })
                    )}

                    <CreateSpaceDialog
                        trigger={
                            <button className="od-card ss-create" type="button">
                                <PlusIcon /> Create a new space
                            </button>
                        }
                    />
                </div>
            </div>
        </div>
    );
});

export default SpaceSelectorPage;

function titleCase(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatMoney(n: number): string {
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

/** Icon paths (lucide-style) keyed by design's name. Glyphs match the
 *  design canvas's Icon set so the visuals stay consistent. */
const ICON_PATHS = {
    sparkle:
        "M12 3v6m0 6v6M3 12h6m6 0h6M6 6l4 4m4 4 4 4M18 6l-4 4m-4 4-4 4",
    home: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
    briefcase:
        "M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2",
    terminal: "m4 6 6 6-6 6m8 0h8",
    book: "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM4 17a3 3 0 0 1 3-3h11",
} as const;

type IconName = keyof typeof ICON_PATHS;

const REAL_SPACE_ICONS: IconName[] = ["home", "briefcase", "terminal", "book"];

const SpaceAvatar = ({
    icon,
    colorVar,
    size = 44,
}: {
    icon: IconName;
    colorVar: string;
    size?: number;
}) => (
    <span
        className="ss-spaceavatar"
        style={{
            width: size,
            height: size,
            color: colorVar,
            background: `color-mix(in oklab, ${colorVar} 18%, transparent)`,
            border: `1px solid color-mix(in oklab, ${colorVar} 30%, transparent)`,
        }}
    >
        <svg
            width={size * 0.5}
            height={size * 0.5}
            viewBox="0 0 24 24"
            fill="none"
        >
            <path
                d={ICON_PATHS[icon]}
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    </span>
);

const ChevronRight = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
            d="M5 12h14m-5-5 5 5-5 5"
            stroke="var(--fg-3)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const PlusIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
            d="M12 5v14m-7-7h14"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
        />
    </svg>
);

const SkeletonCard = () => (
    <div
        className="od-card ss-card"
        aria-hidden
        style={{
            background:
                "linear-gradient(90deg, var(--bg-elev-1), var(--bg-elev-2), var(--bg-elev-1))",
            backgroundSize: "200% 100%",
            animation: "ss-shimmer 1.6s ease-in-out infinite",
        }}
    />
);

const SS_STYLES = `
@keyframes ss-shimmer {
    0%   { background-position: 100% 0; }
    100% { background-position: -100% 0; }
}

.ss-root {
    width: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
}

.ss-header {
    padding: 20px clamp(20px, 4vw, 32px);
    border-bottom: 1px solid var(--line-soft);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
}

.ss-userchip {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    background: transparent;
    border: 0;
    padding: 4px;
    border-radius: 999px;
    cursor: pointer;
    color: var(--fg);
    transition: background 140ms ease;
    font-family: inherit;
}
.ss-userchip:hover { background: var(--bg-elev-2); }
.ss-userchip:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
}

.ss-avatar-img { flex-shrink: 0; }

.ss-body {
    flex: 1;
    overflow-y: auto;
    padding: clamp(40px, 7vh, 60px) clamp(20px, 4vw, 32px) 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 38px;
}

.ss-intro {
    text-align: center;
    max-width: 540px;
}
.ss-title {
    font-size: clamp(2rem, 4vw, 2.375rem);
    font-weight: 500;
    letter-spacing: -0.02em;
    margin: 10px 0 8px;
}
.ss-lede {
    font-size: 14px;
    color: var(--fg-3);
}

.ss-grid {
    width: 100%;
    max-width: 980px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
}

.ss-card {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    border: 1px solid var(--line);
    text-decoration: none;
    color: inherit;
    transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
}
.ss-card:hover {
    border-color: var(--line-strong);
    background: var(--bg-elev-2);
}

.ss-card-personal {
    border: 1px solid color-mix(in oklab, var(--gold) 35%, var(--line));
}
.ss-card-radial {
    position: absolute;
    inset: 0;
    background: radial-gradient(80% 60% at 0% 0%, var(--gold-soft), transparent 60%);
    pointer-events: none;
}

.ss-card-top {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}
.ss-card-name {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    min-width: 0;
}
.ss-card-title {
    font-size: 18px;
    font-weight: 500;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ss-card-sub {
    font-size: 12px;
    color: var(--fg-3);
}

.ss-card-bottom {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 12px;
}

.ss-money {
    margin-top: 4px;
    font-size: 22px;
    font-weight: 500;
    color: var(--fg);
    font-variant-numeric: tabular-nums;
}

.ss-members {
    display: flex;
    margin-right: 8px;
}
.ss-member {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    margin-left: -8px;
    border: 2px solid var(--bg-elev-1);
    display: grid;
    place-items: center;
    font-size: 9px;
    color: white;
    font-weight: 600;
    text-transform: uppercase;
}
.ss-member:first-child { margin-left: 0; }

.ss-spaceavatar {
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.ss-create {
    grid-column: 1 / -1;
    height: 80px;
    padding: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    cursor: pointer;
    border: 1px dashed var(--line-strong);
    background: transparent;
    color: var(--fg-3);
    border-radius: 14px;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    transition: color 140ms ease, border-color 140ms ease;
}
.ss-create:hover {
    color: var(--fg);
    border-color: var(--brand);
}

@media (max-width: 720px) {
    .ss-grid { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
    .ss-header { padding: 14px 16px; }
    .ss-body { padding: 28px 16px; gap: 24px; }
    .ss-card { padding: 18px; gap: 14px; }
    .ss-card-title { font-size: 16px; }
    .ss-money { font-size: 18px; }
    .ss-create { height: auto; padding: 18px; }
}
`;
