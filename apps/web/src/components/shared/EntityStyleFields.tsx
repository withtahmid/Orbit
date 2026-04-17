import { Label } from "@/components/ui/label";
import { ColorPicker } from "@/components/shared/ColorPicker";
import { IconPicker } from "@/components/shared/IconPicker";
import { EntityAvatar } from "@/components/shared/EntityAvatar";

/**
 * Color + Icon picker pair used in every entity's create/edit dialog.
 * Shows a live preview avatar so the user sees the result immediately.
 */
export function EntityStyleFields({
    color,
    setColor,
    icon,
    setIcon,
    name,
}: {
    color: string;
    setColor: (c: string) => void;
    icon: string;
    setIcon: (i: string) => void;
    name?: string;
}) {
    return (
        <div className="grid gap-3">
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
                <EntityAvatar color={color} icon={icon} size="lg" />
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                        {name?.trim() || "Preview"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Icon and color shown everywhere this appears.
                    </p>
                </div>
            </div>
            <div className="grid gap-1.5">
                <Label>Color</Label>
                <ColorPicker value={color} onChange={setColor} />
            </div>
            <div className="grid gap-1.5">
                <Label>Icon</Label>
                <IconPicker value={icon} onChange={setIcon} color={color} />
            </div>
        </div>
    );
}
