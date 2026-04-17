/**
 * Curated palette — hand-picked to pass WCAG AA on the dark card background.
 * Keep this list stable: rows persist these hex values in the DB.
 */
export const ENTITY_COLORS = [
    "#10b981", // emerald
    "#14b8a6", // teal
    "#06b6d4", // cyan
    "#3b82f6", // blue
    "#6366f1", // indigo
    "#8b5cf6", // violet
    "#a855f7", // purple
    "#ec4899", // pink
    "#f43f5e", // rose
    "#f97316", // orange
    "#eab308", // yellow
    "#22c55e", // green
    "#64748b", // slate
    "#78716c", // stone
] as const;

export const DEFAULT_COLOR = ENTITY_COLORS[0];

/**
 * Canonical color for the "unassigned / unallocated" slice in charts and
 * lists. Kept in sync with the slate entry in the curated palette (index
 * 12) so it renders alongside entity colors without feeling out of place.
 * Do not hardcode `#64748b` anywhere else — import this constant.
 */
export const UNALLOCATED_COLOR = "#64748b";

export function isValidColor(c: string): boolean {
    return /^#[0-9a-fA-F]{6}$/.test(c);
}

/**
 * Pick a deterministic fallback color from an id string. Used anywhere an
 * entity didn't save a color (shouldn't happen after migrations, but for
 * client-only aggregates it's useful).
 */
export function colorForId(id: string | null | undefined): string {
    if (!id) return DEFAULT_COLOR;
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return ENTITY_COLORS[h % ENTITY_COLORS.length];
}

/** Mix a color with the card background to produce a readable tinted chip. */
export function colorTint(hex: string, alpha = 0.16): string {
    // returns an rgba() string; the caller can use it as background.
    const v = hex.replace("#", "");
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
