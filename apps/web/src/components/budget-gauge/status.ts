/* Derived display state for the EnvelopeGlass gauge. Kept out of the .tsx so
 * the component file only exports components (react-refresh friendliness). */

export type GlassStatus = "calm" | "warning" | "over" | "saving" | "complete";

export interface GlassStateInput {
    /** "spend" drains as you spend; "save" fills toward a goal target. */
    variant: "spend" | "save";
    /** Amount consumed (spend) or saved (save). */
    current: number;
    /** The budget (spend) or the goal target (save). */
    total: number;
    /** Fraction of budget spent where the amber warning begins (spend only). */
    warnAt?: number;
}

/** Derive the gauge's display state — used to colour edges/labels to match. */
export function glassStatus(p: GlassStateInput): GlassStatus {
    const warnAt = p.warnAt ?? 0.8;
    if (p.variant === "save") {
        return p.total > 0 && p.current > p.total ? "complete" : "saving";
    }
    if (p.current > p.total) return "over";
    const safe = p.total > 0 ? p.total : 1;
    return p.current / safe >= warnAt ? "warning" : "calm";
}
