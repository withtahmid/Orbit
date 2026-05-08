import { useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
    ENTITY_ICONS,
    ENTITY_ICON_CATEGORIES,
    ENTITY_ICON_NAMES,
    getIcon,
} from "@/lib/entityIcons";

/**
 * Editorial-dark icon picker — search bar on top, scrollable body with
 * sticky category headers. Selecting an icon highlights it with the active
 * color tinted background + colored stroke.
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
    const tone = color ?? "var(--brand)";

    return (
        <div
            className={cn("orbit-design op-icon-picker", className)}
        >
            <style>{ICON_PICKER_STYLES}</style>
            <div className="op-icon-search">
                <Search
                    className="op-icon-search-glass size-3.5"
                    aria-hidden
                    style={{ color: "var(--fg-4)" }}
                />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Search ${ENTITY_ICON_NAMES.length} icons…`}
                    className="op-icon-search-input"
                    aria-label="Search icons"
                />
                {query && (
                    <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="op-icon-search-clear"
                        aria-label="Clear search"
                    >
                        <X className="size-3" />
                    </button>
                )}
            </div>

            <div
                className="op-icon-body"
                role="radiogroup"
                aria-label="Icon"
            >
                {totalMatches === 0 ? (
                    <p className="op-icon-empty">No icons match &ldquo;{query}&rdquo;</p>
                ) : (
                    groups.map((group) =>
                        group.names.length === 0 ? null : (
                            <div key={group.label} className="op-icon-group">
                                <div className="op-icon-group-head">{group.label}</div>
                                <div className="op-icon-grid">
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
                                                    "op-icon-cell",
                                                    active && "is-active"
                                                )}
                                                style={
                                                    active
                                                        ? {
                                                              background: `color-mix(in oklab, ${tone} 18%, transparent)`,
                                                              borderColor: `color-mix(in oklab, ${tone} 35%, transparent)`,
                                                              color: tone,
                                                          }
                                                        : undefined
                                                }
                                            >
                                                <Icon className="size-4" />
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

/**
 * Compact popover-trigger that renders a small icon-preview + chevron
 * button. Opens the editorial-dark IconPicker in a popover. Use this in
 * dialogs where the inline picker would dominate the form. `portal={false}`
 * keeps the popover inside the dialog's focus trap and scroll lock.
 */
export function IconPickerButton({
    value,
    onChange,
    color,
    className,
}: {
    value: string;
    onChange: (name: string) => void;
    color?: string;
    className?: string;
}) {
    const Icon = getIcon(value);
    const tone = color ?? "var(--fg-2)";
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn("op-picker-trigger", className)}
                    aria-label="Choose icon"
                    title="Icon"
                >
                    <span
                        className="op-picker-trigger-icon"
                        style={{ color: tone }}
                        aria-hidden
                    >
                        <Icon className="size-4" />
                    </span>
                    <span className="op-picker-trigger-hex">{value}</span>
                    <ChevronDown className="size-3 op-picker-trigger-chev" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                portal={false}
                align="start"
                className="orbit-design w-[min(22rem,calc(100vw-1.5rem))] p-0 bg-transparent border-0 shadow-none"
                style={{
                    maxHeight:
                        "min(var(--radix-popover-content-available-height, 26rem), 26rem)",
                }}
            >
                <IconPicker value={value} onChange={onChange} color={color} />
            </PopoverContent>
        </Popover>
    );
}

const ICON_PICKER_STYLES = `
.op-icon-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 12px;
    background: var(--bg-elev-1);
    border: 1px solid var(--line);
    color: var(--fg);
    max-height: 28rem;
    font-family: "Geist", ui-sans-serif, system-ui, sans-serif;
}
.op-icon-search {
    position: relative;
    display: flex;
    align-items: center;
    height: 36px;
    padding: 0 12px;
    border-radius: 10px;
    background: var(--bg-elev-2);
    border: 1px solid var(--line);
}
.op-icon-search-glass {
    margin-right: 8px;
    flex-shrink: 0;
}
.op-icon-search-input {
    flex: 1;
    background: transparent;
    border: 0;
    outline: none;
    color: var(--fg);
    font-size: 13px;
    font-family: inherit;
    min-width: 0;
}
.op-icon-search-input::placeholder { color: var(--fg-4); }
.op-icon-search-clear {
    margin-left: 4px;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: transparent;
    border: 0;
    color: var(--fg-4);
    cursor: pointer;
    display: grid;
    place-items: center;
}
.op-icon-search-clear:hover { color: var(--fg-2); background: var(--bg-elev-3); }

.op-icon-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 4px 2px;
}
.op-icon-empty {
    padding: 32px 0;
    text-align: center;
    color: var(--fg-4);
    font-size: 12.5px;
}
.op-icon-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.op-icon-group-head {
    position: sticky;
    top: 0;
    background: var(--bg-elev-1);
    padding: 6px 4px;
    font-size: 10px;
    color: var(--fg-4);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 500;
    z-index: 1;
}
.op-icon-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
}
@media (max-width: 480px) {
    .op-icon-grid { grid-template-columns: repeat(6, 1fr); }
}
.op-icon-cell {
    aspect-ratio: 1;
    min-height: 36px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--fg-3);
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 0;
    transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
}
.op-icon-cell:hover {
    background: var(--bg-elev-2);
    color: var(--fg);
}
.op-icon-cell.is-active {
    /* inline styles override these for tinted-by-color */
}
`;
