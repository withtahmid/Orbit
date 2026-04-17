import { cn } from "@/lib/utils";
import { getIcon } from "@/lib/entityIcons";
import { colorTint } from "@/lib/entityStyle";

type Size = "sm" | "md" | "lg";

/**
 * Small rounded tinted chip with an icon — used everywhere an entity
 * (envelope, plan, account, category, event) needs a visual ID.
 */
export function EntityAvatar({
    color,
    icon,
    size = "md",
    className,
}: {
    color: string;
    icon: string | null | undefined;
    size?: Size;
    className?: string;
}) {
    const Icon = getIcon(icon);
    const dim =
        size === "sm" ? "size-7 rounded-md" : size === "lg" ? "size-12 rounded-xl" : "size-9 rounded-lg";
    const iconSize = size === "sm" ? "size-3.5" : size === "lg" ? "size-6" : "size-4";

    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center justify-center",
                dim,
                className
            )}
            style={{ backgroundColor: colorTint(color, 0.22), color }}
        >
            <Icon className={iconSize} />
        </span>
    );
}
