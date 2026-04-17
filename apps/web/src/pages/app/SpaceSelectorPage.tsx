import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/trpc";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { CreateSpaceDialog } from "@/features/spaces/CreateSpaceDialog";
import { ROUTES } from "@/router/routes";
import type { SpaceRole } from "@/lib/permissions";

export default function SpaceSelectorPage() {
    const spacesQuery = trpc.space.list.useQuery();

    return (
        <div>
            <PageHeader
                title="Your spaces"
                description="Pick a workspace or create a new one"
                actions={<CreateSpaceDialog />}
            />

            {spacesQuery.isLoading ? (
                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-40 rounded-xl" />
                    ))}
                </div>
            ) : (spacesQuery.data ?? []).length === 0 ? (
                <div className="mt-8">
                    <EmptyState
                        icon={Sparkles}
                        title="Create your first space"
                        description="Spaces organize your finances. Invite family or collaborators, share accounts and budgets."
                        action={<CreateSpaceDialog />}
                    />
                </div>
            ) : (
                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {(spacesQuery.data ?? []).map((s) => (
                        <Link key={s.id} to={ROUTES.space(s.id)} className="group block">
                            <Card className="h-full transition-colors hover:border-primary/60 hover:shadow-lg">
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand-gradient-to text-lg font-bold text-white">
                                            {s.name[0]?.toUpperCase() ?? "S"}
                                        </div>
                                        <RoleBadge role={s.myRole as unknown as SpaceRole} />
                                    </div>
                                    <CardTitle className="mt-4 text-lg">{s.name}</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <div className="flex items-center justify-end text-sm text-muted-foreground group-hover:text-primary">
                                        Open
                                        <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-1" />
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
