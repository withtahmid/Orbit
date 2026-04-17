import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/shared/PageHeader";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/router/routes";

export default function ProfilePage() {
    const meQuery = trpc.auth.me.useQuery();

    return (
        <div className="grid gap-6">
            <PageHeader
                title="Profile"
                description="Your personal information"
                actions={
                    <Button asChild variant="outline">
                        <Link to={ROUTES.security}>Security settings</Link>
                    </Button>
                }
            />
            <Card>
                <CardHeader className="flex-row items-center gap-4 md:flex-row">
                    <Avatar className="size-16">
                        <AvatarFallback className="bg-gradient-to-br from-primary to-brand-gradient-to text-lg font-bold text-white">
                            {meQuery.data
                                ? `${meQuery.data.first_name[0] ?? ""}${meQuery.data.last_name[0] ?? ""}`.toUpperCase()
                                : "??"}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                        {meQuery.isLoading ? (
                            <Skeleton className="h-6 w-40" />
                        ) : (
                            <CardTitle>
                                {meQuery.data?.first_name} {meQuery.data?.last_name}
                            </CardTitle>
                        )}
                        {meQuery.isLoading ? (
                            <Skeleton className="mt-2 h-4 w-56" />
                        ) : (
                            <CardDescription>{meQuery.data?.email}</CardDescription>
                        )}
                    </div>
                </CardHeader>
                <Separator />
                <CardContent className="grid gap-4 pt-6">
                    <InfoRow label="User ID" value={meQuery.data?.id ?? "—"} mono />
                    <InfoRow label="Email" value={meQuery.data?.email ?? "—"} />
                </CardContent>
            </Card>
        </div>
    );
}

function InfoRow({
    label,
    value,
    mono,
}: {
    label: string;
    value: string;
    mono?: boolean;
}) {
    return (
        <div className="grid gap-1 sm:grid-cols-[160px_1fr] sm:items-center">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={mono ? "break-all font-mono text-sm" : "text-sm"}>{value}</p>
        </div>
    );
}
