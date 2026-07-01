/* EnvelopeGlass — a budget envelope drawn as a fluid glass of money.
 *
 * Adapted from the bundled budget-gauge design pack (README "Budget envelope
 * gauges"). We keep the *mechanics* — the draining liquid, the red hatched
 * deficit, the >100% rescale with a "1×" line, the reduced-motion handling —
 * and re-skin everything to Orbit's design tokens and the envelope's own
 * color, per the design's own integration note.
 *
 * Two sizes:  "card" (full glass, grid view) and "pot" (mini, list rows).
 * Two variants:
 *   - "spend"  the liquid is money REMAINING and DRAINS as you spend; once
 *              overspent the glass empties and a red deficit rises from the
 *              bottom (and keeps rising past a whole budget over).
 *   - "save"   (goals) the liquid is money SAVED and FILLS toward the target,
 *              capping at the rim once reached (over-funding is spelled out in
 *              the card copy, not a rescaled gauge).
 *
 * Liquid color is a semantic health signal, not the envelope's identity hue:
 * calm spend = --brand, warning (≥ warnAt) = --warn, over = --expense; goals
 * fill in --gold. The envelope's own color lives on the avatar instead.
 */

import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { glassStatus } from "./status";

/* ---- glass geometry (card SVG viewBox 0 0 120 220) ------------------------ */
const GLASS = { IX0: 18, IX1: 102, IY0: 12, IY1: 208, IH: 196 } as const;
/* ---- mini-pot geometry (row SVG viewBox 0 0 48 64) ------------------------ */
const POT = { X0: 7, X1: 41, Y0: 8, Y1: 56, H: 48 } as const;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Liquid level = money remaining, as a fraction of budget (0 empty, 1 full). */
function remainingFraction(spent: number, budget: number): number {
    if (budget <= 0) return 0;
    return clamp((budget - spent) / budget, 0, 1);
}

interface GaugeColors {
    fluid: string;
    back: string;
    surface: string;
}

/** Derive the back/crest shades from a base color (a hex or a CSS var()). */
function shadesFor(base: string): GaugeColors {
    return {
        fluid: base,
        back: `color-mix(in oklab, ${base} 60%, #000)`,
        surface: `color-mix(in oklab, ${base} 42%, #fff)`,
    };
}

/* ---- wave geometry (built once; level via translateY, slosh via translateX) */
function buildBody(amp: number, len: number): string {
    const x0 = -60,
        x1 = 180,
        floor = 400,
        step = len / 16;
    let d = `M ${x0} ${(amp * Math.sin((x0 / len) * 2 * Math.PI)).toFixed(2)}`;
    for (let x = x0 + step; x <= x1; x += step)
        d += ` L ${x.toFixed(2)} ${(amp * Math.sin((x / len) * 2 * Math.PI)).toFixed(2)}`;
    d += ` L ${x1} ${floor} L ${x0} ${floor} Z`;
    return d;
}
function buildCrest(amp: number, len: number): string {
    const x0 = -60,
        x1 = 180,
        step = len / 16;
    let d = `M ${x0} ${(amp * Math.sin((x0 / len) * 2 * Math.PI)).toFixed(2)}`;
    for (let x = x0 + step; x <= x1; x += step)
        d += ` L ${x.toFixed(2)} ${(amp * Math.sin((x / len) * 2 * Math.PI)).toFixed(2)}`;
    return d;
}

function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const m = window.matchMedia("(prefers-reduced-motion: reduce)");
        const on = () => setReduced(m.matches);
        on();
        m.addEventListener?.("change", on);
        return () => m.removeEventListener?.("change", on);
    }, []);
    return reduced;
}

/* A slosh animation for a wave layer — translates it horizontally by exactly
 * one wavelength (dx) so the loop is seamless. Disabled under reduced motion. */
function sloshStyle(motion: boolean, durationSec: number, dx: number): CSSProperties {
    if (!motion) return {};
    return {
        animation: `eg-slosh ${durationSec}s linear infinite`,
        ["--eg-dx" as never]: `${dx}px`,
    } as CSSProperties;
}

/* ---- one-time keyframe injection (the flowing-liquid slosh) --------------- */
const STYLE_ID = "envelope-glass-styles";
const CSS = `
@keyframes eg-slosh { from { transform: translateX(0); } to { transform: translateX(var(--eg-dx, 0px)); } }
`;
function useGlassStyles(): void {
    useEffect(() => {
        if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
        const el = document.createElement("style");
        el.id = STYLE_ID;
        el.textContent = CSS;
        document.head.appendChild(el);
    }, []);
}

export interface EnvelopeGlassProps {
    /** "spend" drains as you spend; "save" fills toward a goal target. */
    variant: "spend" | "save";
    /** Amount consumed (spend) or saved (save). */
    current: number;
    /** The budget (spend) or the goal target (save). */
    total: number;
    /** "card" = full glass (grid), "pot" = mini glass (list row). */
    size?: "card" | "pot";
    /** Glass height in px for the card size. Default 150. */
    height?: number;
    /** Fraction of budget spent where the amber warning begins (spend only). */
    warnAt?: number;
    /** Optional liquid colour for the calm / saving state — the envelope's own
     *  hue. Warning / over still use the semantic amber / red so the health
     *  signal survives. Omit to use the default semantic brand / gold. */
    color?: string;
}

export function EnvelopeGlass({
    variant,
    current,
    total,
    size = "card",
    height = 150,
    warnAt = 0.8,
    color,
}: EnvelopeGlassProps) {
    useGlassStyles();
    const motion = !usePrefersReducedMotion();
    const uid = useId().replace(/:/g, "");
    const isPot = size === "pot";

    const status = glassStatus({ variant, current, total, warnAt });
    // Genuine overspend needs a real budget to be "over" — spending with
    // nothing allocated isn't a failure (you just haven't budgeted yet), so it
    // must NOT trigger the red deficit; it reads as a neutral empty glass and
    // the surrounding copy says "Spent X · No budget set".
    const over = variant === "spend" && total > 0 && current > total;

    // Liquid level (fraction of glass, 0..1). Spend DRAINS (remaining); goals
    // FILL toward the target and simply cap at the rim once reached — the
    // amount over-funded lives in the card copy, not a rescaled gauge.
    let liquidFrac =
        variant === "spend"
            ? remainingFraction(current, total)
            : clamp(total > 0 ? current / total : 0, 0, 1);
    // Empty if and only if there's nothing left (spend) / saved (goal). Any
    // positive amount shows at least a visible sliver, so the glass never
    // contradicts a "+X left" hero by reading as bone-dry.
    const hasLiquid = liquidFrac > 0;
    if (hasLiquid) liquidFrac = Math.max(liquidFrac, isPot ? 0.05 : 0.035);

    // Overspend deficit (spend only), as a fraction of the budget overspent:
    //   r ≤ 1 (0–100% over): the red rises linearly against the quarter-marks
    //     (50% over reaches the halfway mark).
    //   r > 1 (>100% over): the glass is full of red and a "1× budget" line
    //     drops to 1/r — so the line's height shows how many budgets over you
    //     are (2× → middle, 4× → quarter). The deficit caps at the rim.
    const overRatio =
        variant === "spend" && over && total > 0
            ? (current - total) / total
            : 0;
    const zoom = overRatio > 1;
    const redFrac = clamp(overRatio, 0, 1);

    // Liquid color is a semantic health signal, NOT the envelope's identity
    // hue (that lives on the avatar): calm spend = brand, warning = warn,
    // over = expense; goals fill gold so they read as goals at a glance.
    const liquidBase =
        status === "over"
            ? "var(--expense)"
            : status === "warning"
              ? "var(--warn)"
              : color
                ? color
                : variant === "save"
                  ? "var(--gold)"
                  : "var(--brand)";
    const colors = shadesFor(liquidBase);

    // Geometry per size.
    const g = isPot
        ? { x0: POT.X0, x1: POT.X1, y0: POT.Y0, y1: POT.Y1, ih: POT.H, w: 34 }
        : { x0: GLASS.IX0, x1: GLASS.IX1, y0: GLASS.IY0, y1: GLASS.IY1, ih: GLASS.IH, w: 84 };

    const fluidTopY = g.y1 - liquidFrac * g.ih;
    const deficitY = g.y1 - redFrac * g.ih;
    // The "1× budget" line sits at 1/r of the glass, so its height reads the
    // overspend multiple directly: 2× over → middle, 4× over → quarter up.
    const lineY = g.y1 - (overRatio > 0 ? 1 / overRatio : 0) * g.ih;

    // Slosh durations — a touch livelier in the warning state. dx must equal
    // the negative wavelength of each layer so the loop is seamless.
    const dur = status === "warning" ? { front: 3.4, back: 5 } : { front: 5, back: 7 };
    const wave = useMemo(
        () =>
            isPot
                ? {
                      frontBody: buildBody(1.8, 13),
                      frontCrest: buildCrest(1.8, 13),
                      backBody: buildBody(2.4, 17),
                      frontDx: -13,
                      backDx: -17,
                  }
                : {
                      frontBody: buildBody(3.4, 40),
                      frontCrest: buildCrest(3.4, 40),
                      backBody: buildBody(4.6, 52),
                      frontDx: -40,
                      backDx: -52,
                  },
        [isPot]
    );

    const trans = motion ? "transform .8s cubic-bezier(.22,1,.36,1)" : "none";
    const level: CSSProperties = { transform: `translateY(${fluidTopY}px)`, transition: trans };
    const deficitStyle: CSSProperties = {
        transform: `translateY(${deficitY}px)`,
        transition: trans,
    };
    const fillT: CSSProperties = { transition: motion ? "fill .55s" : "none" };

    const clip = `${uid}-clip`,
        sheen = `${uid}-sheen`,
        hatch = `${uid}-hatch`,
        glassGrad = `${uid}-glass`;

    const vb = isPot ? "0 0 48 64" : "0 0 120 220";
    // The mini-pot is kept compact so list rows don't tower over the old bar.
    const w = isPot ? 30 : Math.round(height * 0.55);
    const h = isPot ? 40 : height;
    const housingRx = isPot ? 10 : 17;
    const interiorRx = isPot ? 7 : 12;

    return (
        <svg
            viewBox={vb}
            width={w}
            height={h}
            role="presentation"
            style={{ display: "block" }}
        >
            <defs>
                <clipPath id={clip}>
                    <rect
                        x={g.x0}
                        y={g.y0}
                        width={g.w}
                        height={g.ih}
                        rx={interiorRx}
                    />
                </clipPath>
                <linearGradient id={sheen} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#ffffff" stopOpacity={isPot ? 0.12 : 0.1} />
                    <stop offset={isPot ? 0.28 : 0.22} stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
                {/* Translucent glass interior so an EMPTY vessel still reads as
                    a clear glass tumbler, not a black void. */}
                <linearGradient id={glassGrad} x1="0" y1="0" x2="0" y2="1">
                    <stop
                        offset="0"
                        stopColor="var(--bg-elev-2)"
                        stopOpacity="0.75"
                    />
                    <stop
                        offset="0.55"
                        stopColor="var(--bg-elev-1)"
                        stopOpacity="0.6"
                    />
                    <stop offset="1" stopColor="var(--bg)" stopOpacity="0.9" />
                </linearGradient>
                <pattern
                    id={hatch}
                    width={isPot ? 5 : 7}
                    height={isPot ? 5 : 7}
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                >
                    <rect
                        width={isPot ? 5 : 7}
                        height={isPot ? 5 : 7}
                        fill="var(--expense)"
                        fillOpacity="0.13"
                    />
                    <line
                        x1="0"
                        y1="0"
                        x2="0"
                        y2={isPot ? 5 : 7}
                        stroke="var(--expense)"
                        strokeWidth={isPot ? 2 : 2.6}
                        strokeOpacity="0.5"
                    />
                </pattern>
            </defs>

            {/* vessel housing */}
            <rect
                x={isPot ? 3 : 13}
                y={isPot ? 4 : 7}
                width={isPot ? 42 : 94}
                height={isPot ? 56 : 206}
                rx={housingRx}
                fill="color-mix(in oklab, var(--bg) 92%, #000)"
                stroke="var(--line-strong)"
                strokeWidth={isPot ? 1.4 : 1.5}
            />

            <g clipPath={`url(#${clip})`}>
                <rect
                    x={g.x0}
                    y={g.y0}
                    width={g.w}
                    height={g.ih}
                    fill={`url(#${glassGrad})`}
                />
                {/* inner left-edge highlight — gives the empty glass curvature */}
                <line
                    x1={g.x0 + (isPot ? 2 : 3)}
                    y1={g.y0 + (isPot ? 4 : 6)}
                    x2={g.x0 + (isPot ? 2 : 3)}
                    y2={g.y1 - (isPot ? 4 : 6)}
                    stroke="#ffffff"
                    strokeOpacity="0.07"
                    strokeWidth={isPot ? 1 : 1.5}
                    strokeLinecap="round"
                />

                {hasLiquid && (
                    <>
                        {/* level <g> sets the liquid height; the inner <g>
                            sloshes the wave horizontally for the flowing look. */}
                        <g style={level}>
                            <g style={sloshStyle(motion, dur.back, wave.backDx)}>
                                <path
                                    d={wave.backBody}
                                    fill={colors.back}
                                    opacity="0.55"
                                    style={fillT}
                                />
                            </g>
                        </g>
                        <g style={level}>
                            <g style={sloshStyle(motion, dur.front, wave.frontDx)}>
                                <path
                                    d={wave.frontBody}
                                    fill={colors.fluid}
                                    style={fillT}
                                />
                                <path
                                    d={wave.frontCrest}
                                    fill="none"
                                    stroke={colors.surface}
                                    strokeWidth={isPot ? 1 : 1.6}
                                    strokeLinecap="round"
                                    style={fillT}
                                />
                            </g>
                        </g>
                    </>
                )}

                {/* spend overspend: red hatched deficit rising from the bottom */}
                {over && (
                    <g style={deficitStyle}>
                        <rect
                            x={g.x0}
                            y="0"
                            width={g.w}
                            height={isPot ? 200 : 400}
                            fill={`url(#${hatch})`}
                        />
                        <line
                            x1={g.x0}
                            x2={g.x1}
                            y1="0"
                            y2="0"
                            stroke="var(--expense)"
                            strokeWidth={isPot ? 1 : 1.5}
                            strokeDasharray={isPot ? "3 2" : "5 3"}
                            strokeOpacity="0.95"
                        />
                    </g>
                )}

                {/* Reference line marking one whole budget of overspend, once
                    the deficit rescales past 100% over — the deficit climbs
                    ABOVE it. Drawn bright (near-white) so it reads clearly
                    against the red hatch; the exact "% over budget" figure
                    lives in the card readout (the line stays unlabeled because
                    a legible SVG label doesn't fit at this size). */}
                {zoom && (
                    <line
                        x1={g.x0}
                        x2={g.x1}
                        y1={lineY}
                        y2={lineY}
                        stroke="var(--fg)"
                        strokeOpacity="0.95"
                        strokeWidth={isPot ? 1 : 1.4}
                        strokeDasharray={isPot ? "2 2" : "3 2.5"}
                    />
                )}

                <rect
                    x={g.x0}
                    y={g.y0}
                    width={g.w}
                    height={g.ih}
                    fill={`url(#${sheen})`}
                />

                {/* quarter marks (card only, hidden once rescaled) */}
                {!isPot &&
                    !zoom &&
                    [0.25, 0.5, 0.75].map((t) => (
                        <line
                            key={t}
                            x1="95"
                            x2="101"
                            y1={g.y1 - t * g.ih}
                            y2={g.y1 - t * g.ih}
                            stroke="var(--fg-4)"
                            strokeWidth="1"
                        />
                    ))}
            </g>

            {/* Goal reached — a gold check badge so a completed goal reads as
                DONE at a glance, not just "full" (100% and 96% would otherwise
                look identical). Drawn over the clip so it's fully visible. */}
            {variant === "save" && status === "complete" && (
                <g>
                    <circle
                        cx={isPot ? 24 : 60}
                        cy={isPot ? 20 : 44}
                        r={isPot ? 8 : 14}
                        fill="var(--gold)"
                        stroke="var(--bg)"
                        strokeWidth={isPot ? 1.6 : 2.4}
                    />
                    <path
                        d={
                            isPot
                                ? "M 20.5 20 L 22.8 22.5 L 27.5 17"
                                : "M 54 44.5 L 58.2 49 L 66.5 39"
                        }
                        fill="none"
                        stroke="var(--bg)"
                        strokeWidth={isPot ? 1.8 : 2.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </g>
            )}
        </svg>
    );
}

export default EnvelopeGlass;
