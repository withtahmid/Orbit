import { Badge } from "@/components/ui/badge";
import { Crown, Pencil, Eye } from "lucide-react";
import type { SpaceRole } from "@/lib/permissions";

export function RoleBadge({ role }: { role: SpaceRole }) {
    if (role === "owner") {
        return (
            <Badge variant="warning">
                <Crown className="size-3" />
                Owner
            </Badge>
        );
    }
    if (role === "editor") {
        return (
            <Badge variant="info">
                <Pencil className="size-3" />
                Editor
            </Badge>
        );
    }
    return (
        <Badge variant="violet">
            <Eye className="size-3" />
            Viewer
        </Badge>
    );
}
