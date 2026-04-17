import { Link, Outlet, useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { LogOut, Settings, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";

export const AppShellLayout = observer(function AppShellLayout() {
    const { authStore } = useStore();
    const navigate = useNavigate();
    const user = authStore.user;

    const initials = user?.name
        ? user.name
              .split(" ")
              .map((s) => s[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase()
        : "?";

    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
                <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
                    <Link to={ROUTES.root} className="text-lg font-bold text-gradient-brand">
                        Orbit
                    </Link>
                    <DropdownMenu>
                        <DropdownMenuTrigger className="outline-none">
                            <Avatar className="size-8 cursor-pointer ring-1 ring-border hover:ring-primary/50">
                                <AvatarFallback className="bg-gradient-to-br from-primary to-brand-gradient-to text-[11px] font-bold text-white">
                                    {initials}
                                </AvatarFallback>
                            </Avatar>
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
                                <Settings className="size-4" />
                                Security
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
            </header>
            <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
                <Outlet />
            </main>
        </div>
    );
});
