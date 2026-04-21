import { Link } from "react-router-dom";
import { ArrowRight, LineChart, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/trpc";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { CreateSpaceDialog } from "@/features/spaces/CreateSpaceDialog";
import { ROUTES } from "@/router/routes";
import type { SpaceRole } from "@/lib/permissions";
import { PERSONAL_SPACE_ID, PERSONAL_SPACE_NAME } from "@/lib/personalSpace";

export default function SpaceSelectorPage() {
    const spacesQuery = trpc.space.list.useQuery();
    const personalSummary = trpc.personal.summary.useQuery({
        // This month — just for the subtitle. The dashboard will refetch
        // with its own date math when the user opens it.
        periodStart: startOfMonth(new Date()),
        periodEnd: endOfMonth(new Date()),
    });

    const memberSpacesCount = personalSummary.data?.memberSpacesCount ?? 0;
    const ownedAccountsCount = personalSummary.data?.ownedAccountsCount ?? 0;

    return (
        <div>
            <PageHeader
                title="Your spaces"
                description="Pick a workspace or create a new one"
                actions={<CreateSpaceDialog />}
            />

            {/* Virtual "My money" card — always first. Works even when the
                user has zero real spaces (it'll show an empty state when
                opened). */}
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Link
                    to={ROUTES.space(PERSONAL_SPACE_ID)}
                    className="group block"
                >
                    <Card
                        className="h-full transition-colors hover:border-primary/60 hover:shadow-lg"
                        style={{ borderTop: "3px solid var(--primary)" }}
                    >
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand-gradient-to text-white">
                                    <LineChart className="size-5" />
                                </div>
                                <Badge variant="outline" className="text-[10px]">
                                    Personal
                                </Badge>
                            </div>
                            <CardTitle className="mt-4 text-lg">
                                {PERSONAL_SPACE_NAME}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">
                                Your money, unioned across every space you're in
                                {personalSummary.data
                                    ? ` · ${memberSpacesCount} space${memberSpacesCount === 1 ? "" : "s"} · ${ownedAccountsCount} owned account${ownedAccountsCount === 1 ? "" : "s"}`
                                    : ""}
                            </p>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="flex items-center justify-end text-sm text-muted-foreground group-hover:text-primary">
                                Open
                                <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-1" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>

                {spacesQuery.isLoading
                    ? Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-40 rounded-xl" />
                      ))
                    : (spacesQuery.data ?? []).map((s) => (
                          <Link
                              key={s.id}
                              to={ROUTES.space(s.id)}
                              className="group block"
                          >
                              <Card className="h-full transition-colors hover:border-primary/60 hover:shadow-lg">
                                  <CardHeader>
                                      <div className="flex items-start justify-between">
                                          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand-gradient-to text-lg font-bold text-white">
                                              {s.name[0]?.toUpperCase() ?? "S"}
                                          </div>
                                          <RoleBadge
                                              role={s.myRole as unknown as SpaceRole}
                                          />
                                      </div>
                                      <CardTitle className="mt-4 text-lg">
                                          {s.name}
                                      </CardTitle>
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

            {!spacesQuery.isLoading && (spacesQuery.data ?? []).length === 0 && (
                <div className="mt-8">
                    <EmptyState
                        icon={Sparkles}
                        title="Create your first space"
                        description="Spaces organize shared finances — invite housemates, family, or collaborators. You can still see your own money under My money above."
                        action={<CreateSpaceDialog />}
                    />
                </div>
            )}
        </div>
    );
}

function startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}
