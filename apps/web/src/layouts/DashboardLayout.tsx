import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";
import {
    BarChart3,
    CirclePlus,
    LogOut,
    Search,
    Settings,
    Shield,
    User,
    Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

/**
 * DashboardLayout
 *
 * Sidebar + top-bar shell for all protected pages.
 * Uses NavLink so active route gets an `active` class automatically.
 */
export const DashboardLayout = observer(() => {
    const { authStore } = useStore();
    const navigate = useNavigate();

    const handleLogout = () => {
        authStore.clearAuth();
        navigate(ROUTES.login);
    };

    const navItems = [
        { to: ROUTES.dashboard, label: "Overview", icon: BarChart3 },
        { to: ROUTES.spaces, label: "Spaces", icon: Wallet },
        { to: ROUTES.searchWithQuery({ q: "" }), label: "Search", icon: Search },
        { to: ROUTES.profile, label: "Profile", icon: User },
        { to: ROUTES.settingsGeneral, label: "Settings", icon: Settings },
    ];

    return (
        <div className="dashboard-layout min-h-screen bg-background text-foreground">
            <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr]">
                <aside className="dashboard-layout__sidebar workspace-glass border-r border-border/70 bg-workspace-sidebar/80 p-4 backdrop-blur-md">
                    <div className="mb-4 rounded-lg border border-border/70 bg-workspace-panel/90 p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                            Workspace
                        </p>
                        <h1 className="mt-1 text-lg font-semibold">Orbit</h1>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {authStore.user?.email}
                        </p>
                    </div>

                    <nav className="flex flex-col gap-1">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    className={({ isActive }) =>
                                        [
                                            "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition",
                                            isActive
                                                ? "bg-primary text-primary-foreground"
                                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                                        ].join(" ")
                                    }
                                >
                                    <Icon className="h-4 w-4" />
                                    {item.label}
                                </NavLink>
                            );
                        })}
                    </nav>

                    <div className="mt-6 grid gap-3">
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button className="w-full justify-start gap-2">
                                    <CirclePlus className="h-4 w-4" />
                                    Quick action
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Create faster</DialogTitle>
                                    <DialogDescription>
                                        Heavy forms are moved to focused flows to keep workspace
                                        screens clean.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => navigate(ROUTES.spaceEdit("new"))}
                                    >
                                        New space
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => navigate(ROUTES.spaces)}
                                    >
                                        Manage spaces and members
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => navigate(ROUTES.settingsGeneral)}
                                    >
                                        Workspace settings
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>

                        <Button
                            variant="outline"
                            className="justify-start gap-2"
                            onClick={() => navigate(ROUTES.search)}
                        >
                            <Search className="h-4 w-4" />
                            Global search
                        </Button>

                        <Button
                            variant="ghost"
                            className="justify-start gap-2 text-destructive"
                            onClick={handleLogout}
                        >
                            <LogOut className="h-4 w-4" />
                            Log out
                        </Button>
                    </div>
                </aside>

                <div className="dashboard-layout__content flex min-h-screen flex-col bg-workspace-rail/60">
                    <header className="workspace-glass sticky top-0 z-20 flex items-center justify-between border-b border-border/70 px-4 py-4 backdrop-blur-md sm:px-6">
                        <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                                Space board
                            </p>
                            <h2 className="text-lg font-semibold">Analytics-ready workspace</h2>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => navigate(ROUTES.settingsSecurity)}
                        >
                            <Shield className="h-4 w-4" />
                            Security
                        </Button>
                    </header>

                    <main className="flex-1 p-4 sm:p-6">
                        <div className="grid gap-4 lg:grid-cols-3">
                            <Card className="workspace-panel lg:col-span-2">
                                <CardHeader>
                                    <CardTitle>Primary analytics canvas</CardTitle>
                                    <CardDescription>
                                        Reserve this zone for trend charts, comparison plots, and
                                        account health over time.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-36 rounded-lg border border-dashed border-border/80 bg-muted/20" />
                                </CardContent>
                            </Card>
                            <Card className="workspace-panel">
                                <CardHeader>
                                    <CardTitle>Insights rail</CardTitle>
                                    <CardDescription>
                                        KPI cards, alerts, and budget anomalies can stack here.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-36 rounded-lg border border-dashed border-border/80 bg-muted/20" />
                                </CardContent>
                            </Card>
                        </div>

                        <section className="mt-6 rounded-xl border border-border/70 bg-workspace-panel/70 p-3 sm:p-4">
                            <Outlet />
                        </section>
                    </main>
                </div>
            </div>
        </div>
    );
});
