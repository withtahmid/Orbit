import { useCurrentSpace } from "@/hooks/useCurrentSpace";
import type { SpaceRole } from "@/lib/permissions";

export function PermissionGate({
    roles,
    children,
    fallback = null,
}: {
    roles: SpaceRole[];
    children: React.ReactNode;
    fallback?: React.ReactNode;
}) {
    const { myRole } = useCurrentSpace();
    if (!roles.includes(myRole)) return <>{fallback}</>;
    return <>{children}</>;
}
