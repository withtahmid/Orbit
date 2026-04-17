import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import { ROUTES } from "@/router/routes";

/** Shared shell for every analytics detail view — back link, header, body. */
export function AnalyticsDetailLayout({
    title,
    description,
    actions,
    children,
}: {
    title: string;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    children: React.ReactNode;
}) {
    const { space } = useCurrentSpace();
    return (
        <div className="grid gap-5 sm:gap-6">
            <Button asChild variant="ghost" size="sm" className="w-fit">
                <Link to={ROUTES.spaceAnalytics(space.id)}>
                    <ArrowLeft />
                    All analytics
                </Link>
            </Button>
            <PageHeader title={title} description={description} actions={actions} />
            {children}
        </div>
    );
}
