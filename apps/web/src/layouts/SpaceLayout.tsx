import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import {
    LayoutDashboard,
    Wallet,
    ArrowLeftRight,
    Mail,
    Target,
    FolderTree,
    CalendarDays,
    BarChart3,
    Settings,
    Menu,
    LogOut,
    User,
    BookOpen,
    LineChart,
} from "lucide-react";
import { useState } from "react";
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
    SheetTrigger,
} from "@/components/ui/sheet";
import { SpaceSwitcher } from "@/features/spaces/SpaceSwitcher";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { useStore } from "@/stores/useStore";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/router/routes";

const FULL_NAV = [
    { label: "Overview", icon: LayoutDashboard, path: "" },
    { label: "Accounts", icon: Wallet, path: "accounts" },
    { label: "Transactions", icon: ArrowLeftRight, path: "transactions" },
    { label: "Envelopes", icon: Mail, path: "envelopes" },
    { label: "Plans", icon: Target, path: "plans" },
    { label: "Categories", icon: FolderTree, path: "categories" },
    { label: "Events", icon: CalendarDays, path: "events" },
    { label: "Analytics", icon: BarChart3, path: "analytics" },
    { label: "Settings", icon: Settings, path: "settings" },
];

// Virtual "My money" space: strip the mutation-oriented tabs. Envelopes,
// plans, categories, events are space-level entities that only make
// sense to create/edit inside a specific real space; Settings doesn't
// apply to a synthesized space. The underlying analytics still fold in
// cross-space envelope/plan/category numbers via personal.* procedures.
const PERSONAL_NAV = FULL_NAV.filter((n) =>
    ["", "accounts", "transactions", "analytics"].includes(n.path)
);

export const SpaceLayout = observer(function SpaceLayout() {
    const { space } = useCurrentSpace();
    const basePath = ROUTES.space(space.id);
    const [mobileOpen, setMobileOpen] = useState(false);
    const nav = space.isPersonal ? PERSONAL_NAV : FULL_NAV;

    return (
        <div className="min-h-screen bg-background">
            <div className="md:grid md:grid-cols-[260px_1fr]">
                {/* Desktop sidebar */}
                <aside className="hidden md:flex md:h-screen md:sticky md:top-0 md:flex-col border-r border-border bg-sidebar">
                    <Sidebar basePath={basePath} nav={nav} onNavigate={() => {}} />
                </aside>

                {/* Main content */}
                <div className="flex min-h-screen flex-col">
                    <header className="flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:hidden">
                        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                            <SheetTrigger asChild>
                                <Button size="icon" variant="ghost">
                                    <Menu />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="w-[260px] bg-sidebar p-0">
                                <SheetHeader className="sr-only">
                                    <SheetTitle>Navigation</SheetTitle>
                                </SheetHeader>
                                <Sidebar
                                    basePath={basePath}
                                    nav={nav}
                                    onNavigate={() => setMobileOpen(false)}
                                />
                            </SheetContent>
                        </Sheet>
                        <div className="text-sm font-semibold">{space.name}</div>
                    </header>
                    <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
                        <Outlet />
                    </main>
                </div>
            </div>
        </div>
    );
});

function Sidebar({
    basePath,
    nav,
    onNavigate,
}: {
    basePath: string;
    nav: typeof FULL_NAV;
    onNavigate: () => void;
}) {
    const { authStore } = useStore();
    const navigate = useNavigate();
    const user = authStore.user;
    const [firstName, ...rest] = (user?.name ?? "").split(" ");
    const lastName = rest.join(" ");

    return (
        <div className="flex h-full flex-col p-3">
            <div className="px-1 py-2">
                <SpaceSwitcher />
            </div>
            <nav className="mt-3 flex flex-1 flex-col gap-0.5">
                {nav.map(({ label, icon: Icon, path }) => {
                    const to = path ? `${basePath}/${path}` : basePath;
                    return (
                        <NavLink
                            key={label}
                            to={to}
                            end={path === ""}
                            onClick={onNavigate}
                            className={({ isActive }) =>
                                cn(
                                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                    isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                                )
                            }
                        >
                            <Icon className="size-4" />
                            {label}
                        </NavLink>
                    );
                })}
            </nav>
            <div className="mt-2 border-t border-sidebar-border pt-3">
                <DropdownMenu>
                    <DropdownMenuTrigger className="w-full outline-none">
                        <div className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-sidebar-accent">
                            <UserAvatar
                                fileId={user?.avatarFileId}
                                firstName={firstName}
                                lastName={lastName}
                                size="sm"
                            />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                    {user?.name ?? "Guest"}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {user?.email}
                                </p>
                            </div>
                        </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="start" className="w-56">
                        <DropdownMenuItem onSelect={() => navigate(ROUTES.profile)}>
                            <User className="size-4" />
                            Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => navigate(ROUTES.security)}>
                            <Settings className="size-4" />
                            Security
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onSelect={() => navigate(ROUTES.space("me"))}
                        >
                            <LineChart className="size-4" />
                            My money
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => navigate(ROUTES.myAccounts)}>
                            <Wallet className="size-4" />
                            My accounts
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => navigate(ROUTES.spaces)}>
                            <ArrowLeftRight className="size-4" />
                            Switch space
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
            </div>
        </div>
    );
}
