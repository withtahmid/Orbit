import { Link, useLocation } from "react-router-dom";
import { ROUTES } from "@/router/routes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
    const location = useLocation();

    return (
        <main className="flex min-h-[50vh] items-center justify-center p-4">
            <Card className="w-full max-w-xl">
                <CardHeader>
                    <CardTitle>404 - Page not found</CardTitle>
                    <CardDescription>
                        The path <code>{location.pathname}</code> is not available in this
                        workspace.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button asChild>
                        <Link to={ROUTES.home}>Back to dashboard</Link>
                    </Button>
                </CardContent>
            </Card>
        </main>
    );
}
