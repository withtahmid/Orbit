import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
    ENTITY_ICONS,
    ENTITY_ICON_CATEGORIES,
    ENTITY_ICON_NAMES,
} from "@/lib/entityIcons";

/**
 * Emoji-picker style icon picker: search bar on top, scrollable body with
 * category headers. Selecting an icon highlights it with the active color.
 */
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
    const [query, setQuery] = useState("");
    const q = query.trim().toLowerCase();

    const groups = useMemo(() => {
        if (!q) {
            return ENTITY_ICON_CATEGORIES.map((c) => ({
                label: c.label,
                names: c.names,
            }));
        }
        const matches = ENTITY_ICON_NAMES.filter((n) => n.toLowerCase().includes(q));
        return [{ label: "Results" as const, names: matches }];
    }, [q]);

    const totalMatches = groups.reduce((sum, g) => sum + g.names.length, 0);

    return (
        <div
            className={cn(
                "flex max-h-[26rem] flex-col rounded-md border border-border bg-muted/30",
                className
            )}
        >
            <div className="relative shrink-0 p-2 pb-1">
                <Search
                    className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search icons..."
                    className="h-8 pl-8 pr-8 text-sm"
                    aria-label="Search icons"
                />
                {query && (
                    <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="absolute right-4 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        aria-label="Clear search"
                    >
                        <X className="size-3.5" />
                    </button>
                )}
            </div>

            <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2"
                role="radiogroup"
                aria-label="Icon"
            >
                {totalMatches === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                        No icons match "{query}"
                    </p>
                ) : (
                    groups.map((group) =>
                        group.names.length === 0 ? null : (
                            <div key={group.label} className="mb-1">
                                <div className="sticky top-0 z-10 -mx-2 bg-muted/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                                    {group.label}
                                </div>
                                <div className="grid grid-cols-7 gap-1 pt-1 sm:grid-cols-8">
                                    {group.names.map((name) => {
                                        const Icon = ENTITY_ICONS[name];
                                        if (!Icon) return null;
                                        const active = value === name;
                                        return (
                                            <button
                                                key={name}
                                                type="button"
                                                role="radio"
                                                aria-checked={active}
                                                aria-label={name}
                                                title={name}
                                                onClick={() => onChange(name)}
                                                className={cn(
                                                    "flex aspect-square min-h-9 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                                    active && "text-white"
                                                )}
                                                style={
                                                    active
                                                        ? {
                                                              backgroundColor:
                                                                  color ?? "var(--primary)",
                                                          }
                                                        : undefined
                                                }
                                            >
                                                <Icon className="size-5" />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )
                    )
                )}
            </div>
        </div>
    );
}
