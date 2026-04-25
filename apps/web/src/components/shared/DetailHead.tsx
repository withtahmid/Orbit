import { cn } from "@/lib/utils";

type Hue = "emerald" | "info" | "warn" | "bad" | "plan";

export function DetailHead({
    icon,
    title,
    sub,
    actions,
    hue = "emerald",
    /**
     * Optional custom color for the icon backing when the entity carries
     * its own color (envelopes, plans, events). Overrides `hue` tint on
     * the icon chip only — the gradient still uses the hue variant.
     */
    iconColor,
    className,
}: {
    icon: React.ReactNode;
    title: React.ReactNode;
    sub?: React.ReactNode;
    actions?: React.ReactNode;
    hue?: Hue;
    iconColor?: string;
    className?: string;
}) {
    const hueClass = `o-detail-head--${hue}`;
    return (
        <div className={cn("o-detail-head", hueClass, className)}>
            <div
                className="o-detail-head__ic"
                style={iconColor ? { ["--o-dh-hue" as string]: iconColor } : undefined}
            >
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <div className="o-detail-head__title truncate">{title}</div>
                {sub && <div className="o-detail-head__sub">{sub}</div>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
    );
}
