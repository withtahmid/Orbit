import { useRef } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/router/routes";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useStore } from "@/stores/useStore";

export default function ProfilePage() {
    const meQuery = trpc.auth.me.useQuery();
    const utils = trpc.useUtils();
    const { authStore } = useStore();
    const { upload, uploading } = useFileUpload();
    const updateAvatar = trpc.user.updateAvatar.useMutation();
    const inputRef = useRef<HTMLInputElement>(null);

    const onPick = async (file: File) => {
        try {
            const fileId = await upload(file, "avatar");
            await updateAvatar.mutateAsync({ fileId });
            authStore.setAvatarFileId(fileId);
            await utils.auth.me.invalidate();
            toast.success("Avatar updated");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Upload failed");
        }
    };

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
                    <div className="relative">
                        <UserAvatar
                            fileId={meQuery.data?.avatar_file_id}
                            firstName={meQuery.data?.first_name}
                            lastName={meQuery.data?.last_name}
                            size="lg"
                        />
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            disabled={uploading || updateAvatar.isPending}
                            className="absolute -bottom-1 -right-1 rounded-full border bg-background p-1 shadow-sm hover:bg-accent disabled:opacity-50"
                            aria-label="Change avatar"
                        >
                            {uploading || updateAvatar.isPending ? (
                                <Loader2 className="size-3 animate-spin" />
                            ) : (
                                <Camera className="size-3" />
                            )}
                        </button>
                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void onPick(f);
                                e.target.value = "";
                            }}
                        />
                    </div>
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
