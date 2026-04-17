import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ENTITY_COLORS } from "@/lib/entityStyle";

export function ColorPicker({
    value,
    onChange,
    className,
}: {
    value: string;
    onChange: (c: string) => void;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "grid grid-cols-7 gap-2 rounded-md border border-border bg-muted/30 p-2 sm:grid-cols-7",
                className
            )}
            role="radiogroup"
            aria-label="Color"
        >
            {ENTITY_COLORS.map((c) => {
                const active = value?.toLowerCase() === c.toLowerCase();
                return (
                    <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={c}
                        onClick={() => onChange(c)}
                        className={cn(
                            "flex aspect-square items-center justify-center rounded-md ring-offset-background transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            active && "ring-2 ring-offset-2 ring-foreground/80"
                        )}
                        style={{ backgroundColor: c }}
                    >
                        {active && <Check className="size-3.5 text-white drop-shadow" />}
                    </button>
                );
            })}
        </div>
    );
}
