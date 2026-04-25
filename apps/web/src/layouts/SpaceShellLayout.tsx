import { lazy, Suspense, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import {
    Home,
    Wallet,
    ArrowLeftRight,
    BarChart3,
    Users,
    CalendarDays,
    BookOpen,
    Settings as SettingsIcon,
    Menu,
    Plus,
    LogOut,
    User,
    PanelLeft,
    LineChart,
    Mail,
    FolderTree,
    Target,
} from "lucide-react";
// Lazy — the new-tx form pulls in a non-trivial amount of form + validation
// code.  The shell sits on every route, so importing it eagerly would grow
// the initial bundle.  We only need it once the user clicks the button.
const NewTransactionSheet = lazy(() =>
    import("@/features/transactions/NewTransactionSheet").then((m) => ({
        default: m.NewTransactionSheet,
    }))
);
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { SpaceSwitcher } from "@/features/spaces/SpaceSwitcher";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { useStore } from "@/stores/useStore";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/router/routes";

type RailItem = {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    path: string;
    end?: boolean;
};
type RailGroup = { heading: string; items: RailItem[] };

// Grouped nav. Envelopes, Categories, and Plans are first-class sections
// because they each serve a distinct analytical role — envelopes for
// bucket-level allocation, categories for the nested tree + priority
// breakdown, plans for long-horizon goals.
const FULL_NAV: RailGroup[] = [
    {
        heading: "Money",
        items: [
            { label: "Home", icon: Home, path: "", end: true },
            { label: "Accounts", icon: Wallet, path: "accounts" },
            { label: "Transactions", icon: ArrowLeftRight, path: "transactions" },
            { label: "Envelopes", icon: Mail, path: "envelopes" },
            { label: "Categories", icon: FolderTree, path: "categories" },
            { label: "Plans", icon: Target, path: "plans" },
            { label: "Analytics", icon: BarChart3, path: "analytics" },
        ],
    },
    {
        heading: "Collaborate",
        items: [
            { label: "Members", icon: Users, path: "settings" },
            { label: "Events", icon: CalendarDays, path: "events" },
        ],
    },
];

// Personal (virtual) space: strip mutation-only nav items. Members, Events,
// and Settings only make sense inside a real space. Cross-space analytics
// still work via the personal.* procedures.
const PERSONAL_NAV: RailGroup[] = [
    {
        heading: "Money",
        items: [
            { label: "Home", icon: Home, path: "", end: true },
            { label: "Transactions", icon: ArrowLeftRight, path: "transactions" },
            { label: "Accounts", icon: Wallet, path: "accounts" },
            { label: "Analytics", icon: BarChart3, path: "analytics" },
        ],
    },
];

const SYSTEM_NAV: RailItem[] = [
    { label: "Docs", icon: BookOpen, path: "__docs" },
    { label: "Preferences", icon: SettingsIcon, path: "__preferences" },
];

export const SpaceShellLayout = observer(function SpaceShellLayout() {
    const { space } = useCurrentSpace();
    const basePath = ROUTES.space(space.id);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [compact, setCompact] = useState(false);
    // The topbar's "New transaction" button drives this — the actual sheet
    // is mounted once at the shell root (after first open) so every page
    // can trigger it without remounting.  Gated by `newTxMounted` so the
    // lazy chunk isn't fetched until the user actually opens it; kept
    // mounted once shown so repeat opens don't refetch.  Personal
    // (virtual) space is read-only, so we skip it entirely.
    const [newTxMounted, setNewTxMounted] = useState(false);
    const [newTxOpen, setNewTxOpen] = useState(false);
    const openNewTx = () => {
        setNewTxMounted(true);
        setNewTxOpen(true);
    };
    const nav = space.isPersonal ? PERSONAL_NAV : FULL_NAV;

    return (
        <div className="min-h-screen bg-background">
            <Topbar
                onToggleRail={() => setCompact((v) => !v)}
                onOpenMobileNav={() => setMobileOpen(true)}
                onNewTx={space.isPersonal ? undefined : openNewTx}
            />

            {!space.isPersonal && newTxMounted && (
                <Suspense fallback={null}>
                    <NewTransactionSheet
                        open={newTxOpen}
                        onOpenChange={setNewTxOpen}
                        hideTrigger
                    />
                </Suspense>
            )}
            <div
                className={cn(
                    "md:grid md:transition-[grid-template-columns] md:duration-200",
                    compact
                        ? "md:grid-cols-[64px_minmax(0,1fr)]"
                        : "md:grid-cols-[224px_minmax(0,1fr)]"
                )}
            >
                {/* Desktop rail */}
                <aside className="hidden md:sticky md:top-[52px] md:flex md:h-[calc(100vh-52px)] md:flex-col">
                    <Rail
                        basePath={basePath}
                        nav={nav}
                        compact={compact}
                        onNavigate={() => {}}
                    />
                </aside>

                {/* Mobile rail — a sheet, same content */}
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                    <SheetContent side="left" className="w-[260px] p-0">
                        <SheetHeader className="sr-only">
                            <SheetTitle>Navigation</SheetTitle>
                        </SheetHeader>
                        <Rail
                            basePath={basePath}
                            nav={nav}
                            compact={false}
                            onNavigate={() => setMobileOpen(false)}
                        />
                    </SheetContent>
                </Sheet>

                {/* Main content */}
                <main className="min-w-0 px-4 py-5 sm:px-6 sm:py-7 md:px-10 md:py-10">
                    <div className="mx-auto max-w-[1240px]">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
});

function Topbar({
    onToggleRail,
    onOpenMobileNav,
    /** When provided, show a "New transaction" action that calls this.
     *  Undefined in the virtual personal space where mutations don't apply. */
    onNewTx,
}: {
    onToggleRail: () => void;
    onOpenMobileNav: () => void;
    onNewTx?: () => void;
}) {
    return (
        <header className="sticky top-0 z-40 flex h-13 items-center gap-3 border-b border-border bg-[color-mix(in_oklch,var(--o-bg-0)_85%,black)] px-4 backdrop-blur">
            {/* Mobile hamburger — opens the rail Sheet */}
            <Button
                size="icon"
                variant="ghost"
                className="md:hidden"
                onClick={onOpenMobileNav}
                aria-label="Open navigation"
            >
                <Menu />
            </Button>
            {/* Desktop rail collapse toggle */}
            <Button
                size="icon"
                variant="ghost"
                className="hidden md:inline-flex"
                onClick={onToggleRail}
                aria-label="Toggle sidebar"
            >
                <PanelLeft className="size-4" />
            </Button>

            <Link
                to={ROUTES.root}
                className="flex items-center gap-2 px-1 text-[17px] font-semibold tracking-tight"
            >
                <span
                    className="o-brand-mark"
                    style={{ width: 26, height: 26, borderRadius: 6, fontSize: 14 }}
                    aria-hidden
                >
                    O
                </span>
                <span className="hidden sm:inline">Orbit</span>
            </Link>

            {/* Space switcher — hidden on mobile because the mobile rail sheet
                owns it; on desktop it lives up here as a first-class chip. */}
            <div className="ml-1 hidden md:block">
                <SpaceSwitcher />
            </div>

            <div className="ml-auto flex items-center gap-2">
                {onNewTx && (
                    <Button
                        variant="gradient"
                        size="sm"
                        onClick={onNewTx}
                        className="hidden sm:inline-flex"
                    >
                        <Plus className="size-3.5" />
                        <span>New transaction</span>
                    </Button>
                )}
                <UserMenu />
            </div>
        </header>
    );
}

function UserMenu() {
    const { authStore } = useStore();
    const navigate = useNavigate();
    const user = authStore.user;
    const [firstName, ...rest] = (user?.name ?? "").split(" ");
    const lastName = rest.join(" ");

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="outline-none">
                <UserAvatar
                    fileId={user?.avatarFileId}
                    firstName={firstName}
                    lastName={lastName}
                    size="sm"
                    className="cursor-pointer ring-1 ring-border hover:ring-primary/50"
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user?.name ?? "Guest"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                        {user?.email}
                    </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate(ROUTES.profile)}>
                    <User className="size-4" />
                    Profile
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate(ROUTES.security)}>
                    <SettingsIcon className="size-4" />
                    Security
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate(ROUTES.space("me"))}>
                    <LineChart className="size-4" />
                    My money
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate(ROUTES.myAccounts)}>
                    <Wallet className="size-4" />
                    My accounts
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate(ROUTES.docs)}>
                    <BookOpen className="size-4" />
                    Help & docs
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => {
                        authStore.clearAuth();
                        navigate(ROUTES.login, { replace: true });
                    }}
                >
                    <LogOut className="size-4" />
                    Log out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function Rail({
    basePath,
    nav,
    compact,
    onNavigate,
}: {
    basePath: string;
    nav: RailGroup[];
    compact: boolean;
    onNavigate: () => void;
}) {
    const navigate = useNavigate();

    return (
        <div className={cn("o-rail h-full min-h-0 flex-1", compact && "o-rail--compact")}>
            {nav.map((group) => (
                <div key={group.heading}>
                    <div className="o-rail__section">{group.heading}</div>
                    {group.items.map(({ label, icon: Icon, path, end }) => {
                        const to = path ? `${basePath}/${path}` : basePath;
                        return (
                            <NavLink
                                key={label}
                                to={to}
                                end={end}
                                onClick={onNavigate}
                                title={compact ? label : undefined}
                                className={({ isActive }) =>
                                    cn("o-rail__item", isActive && "is-active")
                                }
                            >
                                <Icon className="size-[17px]" />
                                <span>{label}</span>
                            </NavLink>
                        );
                    })}
                </div>
            ))}

            <div className="mt-auto">
                <div className="o-rail__section">System</div>
                {SYSTEM_NAV.map(({ label, icon: Icon, path }) => {
                    const to = path === "__docs" ? ROUTES.docs : ROUTES.profile;
                    return (
                        <button
                            key={label}
                            onClick={() => {
                                navigate(to);
                                onNavigate();
                            }}
                            title={compact ? label : undefined}
                            className="o-rail__item"
                        >
                            <Icon className="size-[17px]" />
                            <span>{label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
