import { cn } from "@/lib/utils";
import { ENTITY_ICON_NAMES, ENTITY_ICONS } from "@/lib/entityIcons";

export function IconPicker({
    value,
    onChange,
    color,
    className,
}: {
    value: string;
    onChange: (name: string) => void;
    /** Optional color that fills the selected icon's background */
    color?: string;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "grid max-h-56 grid-cols-8 gap-1.5 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 sm:grid-cols-10",
                className
            )}
            role="radiogroup"
            aria-label="Icon"
        >
            {ENTITY_ICON_NAMES.map((name) => {
                const Icon = ENTITY_ICONS[name];
                const active = value === name;
                return (
                    <button
                        key={name}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={name}
                        onClick={() => onChange(name)}
                        className={cn(
                            "flex aspect-square items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active && "text-white"
                        )}
                        style={
                            active
                                ? { backgroundColor: color ?? "var(--primary)" }
                                : undefined
                        }
                    >
                        <Icon className="size-4" />
                    </button>
                );
            })}
        </div>
    );
}
