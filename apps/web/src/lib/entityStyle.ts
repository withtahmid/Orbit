/**
 * Curated palette — hand-picked to pass WCAG AA on the dark card background.
 * Colors are stored in the DB as raw hex strings, so this list can grow
 * freely without migrations; ordering below is purely visual (spectrum
 * flows left-to-right, row-by-row) for the picker UI.
 */
export const ENTITY_COLORS = [
    // --- reds / pinks / roses ---
    "#ef4444", // red-500
    "#dc2626", // red-600
    "#f43f5e", // rose-500
    "#fb7185", // rose-400
    "#ec4899", // pink-500
    "#db2777", // pink-600
    "#f472b6", // pink-400

    // --- fuchsia / purple / violet ---
    "#d946ef", // fuchsia-500
    "#c026d3", // fuchsia-600
    "#a855f7", // purple-500
    "#9333ea", // purple-600
    "#c084fc", // purple-400
    "#8b5cf6", // violet-500
    "#7c3aed", // violet-600

    // --- indigo / blue / sky ---
    "#6366f1", // indigo-500
    "#4f46e5", // indigo-600
    "#818cf8", // indigo-400
    "#3b82f6", // blue-500
    "#2563eb", // blue-600
    "#60a5fa", // blue-400
    "#0ea5e9", // sky-500

    // --- cyan / teal ---
    "#06b6d4", // cyan-500
    "#0891b2", // cyan-600
    "#22d3ee", // cyan-400
    "#14b8a6", // teal-500
    "#0d9488", // teal-600
    "#2dd4bf", // teal-400

    // --- greens / limes ---
    "#10b981", // emerald-500
    "#059669", // emerald-600
    "#34d399", // emerald-400
    "#22c55e", // green-500
    "#16a34a", // green-600
    "#84cc16", // lime-500
    "#65a30d", // lime-600

    // --- yellows / ambers / oranges ---
    "#eab308", // yellow-500
    "#ca8a04", // yellow-600
    "#f59e0b", // amber-500
    "#d97706", // amber-600
    "#f97316", // orange-500
    "#ea580c", // orange-600
    "#fb923c", // orange-400

    // --- neutrals (kept last so they don't dominate) ---
    "#64748b", // slate-500
    "#475569", // slate-600
    "#71717a", // zinc-500
    "#78716c", // stone-500
    "#6b7280", // gray-500
] as const;

export const DEFAULT_COLOR: string = "#10b981";

/**
 * Canonical color for the "unassigned / unallocated" slice in charts and
 * lists. Kept in sync with the slate entry in the curated palette so it
 * renders alongside entity colors without feeling out of place.
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
