import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/router/routes";

function describeError(error: unknown): { title: string; description: string; status?: number } {
    if (isRouteErrorResponse(error)) {
        return {
            status: error.status,
            title: error.statusText || "Something went wrong",
            description:
                typeof error.data === "string" && error.data.length > 0
                    ? error.data
                    : "The page failed to load. Please try again.",
        };
    }
    if (error instanceof Error) {
        return {
            title: "Something went wrong",
            description: error.message || "An unexpected error occurred.",
        };
    }
    return {
        title: "Something went wrong",
        description: "An unexpected error occurred.",
    };
}

export default function ErrorBoundaryPage() {
    const error = useRouteError();
    const { title, description, status } = describeError(error);

    if (import.meta.env.DEV) {
        console.error("Route error:", error);
    }

    const stack =
        import.meta.env.DEV && error instanceof Error ? error.stack : undefined;

    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="size-7" />
            </div>
            {status !== undefined && (
                <p className="text-7xl font-black text-gradient-brand">{status}</p>
            )}
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="max-w-md text-sm text-muted-foreground">{description}</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <Button variant="outline" onClick={() => window.location.reload()}>
                    <RefreshCw className="size-4" />
                    Reload
                </Button>
                <Button asChild variant="gradient">
                    <Link to={ROUTES.root}>Back to Orbit</Link>
                </Button>
            </div>
            {stack && (
                <details className="mt-6 max-w-2xl text-left">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                        Error details (dev only)
                    </summary>
                    <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
                        {stack}
                    </pre>
                </details>
            )}
        </div>
    );
}
