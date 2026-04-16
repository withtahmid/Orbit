import { observer } from "mobx-react-lite";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "@/stores/useStore";
import { ROUTES } from "@/router/routes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const DashboardPage = observer(() => {
    const { authStore } = useStore();
    const navigate = useNavigate();

    return (
        <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">
                        Hello, {authStore.user?.name ?? "there"}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        This board is tuned for chart-heavy workflows and multi-space collaboration.
                    </p>
                </div>
                <Button variant="outline" onClick={() => navigate(ROUTES.userDetail("42"))}>
                    View User #42
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle>Cashflow trend</CardTitle>
                        <CardDescription>
                            Monthly inflow vs outflow chart placeholder
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-24 rounded-md border border-dashed border-border/80 bg-muted/20" />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Budget burn rate</CardTitle>
                        <CardDescription>Envelope utilization snapshot</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-24 rounded-md border border-dashed border-border/80 bg-muted/20" />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Plan allocation</CardTitle>
                        <CardDescription>Long-term goal progress chart</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-24 rounded-md border border-dashed border-border/80 bg-muted/20" />
                    </CardContent>
                </Card>
            </div>

            <Link
                to={ROUTES.searchWithQuery({ q: "transactions", page: "1" })}
                className="signup-link"
            >
                Search transactions
            </Link>
        </div>
    );
});
