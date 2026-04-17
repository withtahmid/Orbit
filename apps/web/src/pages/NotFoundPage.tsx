import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/router/routes";

export default function NotFoundPage() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
            <p className="text-7xl font-black text-gradient-brand">404</p>
            <h1 className="text-2xl font-bold">Page not found</h1>
            <p className="max-w-md text-sm text-muted-foreground">
                The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have
                access.
            </p>
            <Button asChild variant="gradient">
                <Link to={ROUTES.root}>Back to Orbit</Link>
            </Button>
        </div>
    );
}
