import { Construction } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";

export function PlaceholderPage({ title }: { title: string }) {
    return (
        <div>
            <PageHeader title={title} />
            <div className="mt-6">
                <EmptyState
                    icon={Construction}
                    title={`${title} — coming soon`}
                    description="This page is being built. Check back after the next iteration."
                />
            </div>
        </div>
    );
}
