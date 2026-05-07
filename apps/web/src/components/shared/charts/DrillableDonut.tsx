import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DrillableDonutSlice {
    id: string;
    /** Display name for the slice — surfaces in the legend chip + tooltip. */
    name: string;
    value: number;
    /** Hex color for this slice. */
    color: string;
    /** True if clicking the slice should drill into it (renders a halo + chevron). */
    drillable?: boolean;
}

interface Props {
    slices: DrillableDonutSlice[];
    /** Eyebrow text inside the donut (e.g. "Total"). */
    centerLabel?: string;
    /** Pre-formatted value displayed inside the donut. */
    centerValue?: string;
    /** Outer diameter of the donut, in pixels. */
    size?: number;
    /** Stroke width — the thicker, the chunkier the donut. */
    thickness?: number;
    /** Click handler for slices and legend chips. */
    onSelect?: (slice: DrillableDonutSlice) => void;
    emptyLabel?: string;
    className?: string;
}

/**
 * Editorial-dark donut chart, hand-rolled in SVG with stroke-dasharray
 * arcs (no recharts). Drillable slices grow a thin outer halo that
 * brightens on hover, signalling "click to descend." Mirrors the
 * `DrillableDonut` from the design canvas — same geometry, same
 * interaction shape — and pairs with a chip-style legend below the
 * chart that surfaces a `>` chevron for drillable items.
 *
 * Why not recharts: recharts' Pie wraps slices in `<g>` with implicit
 * focus rings, has fragile activeIndex semantics, and doesn't support
 * the design's per-slice halo without ejecting to a custom shape.
 * Stroke-dasharray on a circle is a few lines and gives us the look
 * directly.
 */
export function DrillableDonut({
    slices,
    centerLabel = "Total",
    centerValue,
    size = 240,
    thickness = 28,
    onSelect,
    emptyLabel = "No data",
    className,
}: Props) {
    const [hoverId, setHoverId] = useState<string | null>(null);

    if (slices.length === 0) {
        return (
            <div
                className={cn(
                    "flex items-center justify-center text-sm text-muted-foreground",
                    className
                )}
                style={{ height: size }}
            >
                {emptyLabel}
            </div>
        );
    }

    const r = (size - thickness) / 2;
    const c = 2 * Math.PI * r;
    const total = slices.reduce((s, x) => s + x.value, 0) || 1;
    const haloR = r + thickness / 2 + 3;
    const haloC = 2 * Math.PI * haloR;

    let acc = 0;
    const arcs = slices.map((s) => {
        const len = (s.value / total) * c;
        const off = c - acc;
        acc += len;
        return { slice: s, len, off };
    });

    return (
        <div
            className={cn(
                "flex flex-col items-center gap-4",
                className
            )}
        >
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                role="img"
                aria-label="Distribution donut chart"
            >
                {/* Track ring — the empty slot beneath the segments */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke="var(--bg-elev-3, var(--muted))"
                    strokeWidth={thickness}
                />

                {arcs.map(({ slice, len, off }) => {
                    const drillable = !!slice.drillable;
                    const isHover = hoverId === slice.id;
                    return (
                        <g
                            key={slice.id}
                            onMouseEnter={() => setHoverId(slice.id)}
                            onMouseLeave={() => setHoverId(null)}
                            onClick={() => onSelect?.(slice)}
                            style={{
                                cursor:
                                    drillable || onSelect
                                        ? "pointer"
                                        : "default",
                            }}
                        >
                            {/* Main arc */}
                            <circle
                                cx={size / 2}
                                cy={size / 2}
                                r={r}
                                fill="none"
                                stroke={slice.color}
                                strokeWidth={thickness}
                                strokeDasharray={`${len} ${c - len}`}
                                strokeDashoffset={off}
                                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                                strokeLinecap="butt"
                                style={{
                                    opacity: hoverId && !isHover ? 0.55 : 1,
                                    transition: "opacity 140ms ease",
                                }}
                            />
                            {/* Drillable halo — outer hint ring that intensifies on hover */}
                            {drillable && (
                                <circle
                                    cx={size / 2}
                                    cy={size / 2}
                                    r={haloR}
                                    fill="none"
                                    stroke={slice.color}
                                    strokeWidth={1.5}
                                    opacity={isHover ? 0.85 : 0.4}
                                    strokeDasharray={`${(len * haloR) / r} ${
                                        haloC - (len * haloR) / r
                                    }`}
                                    strokeDashoffset={(off * haloR) / r}
                                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                                    style={{ transition: "opacity 140ms ease" }}
                                />
                            )}
                        </g>
                    );
                })}

                {/* Center text — uppercase eyebrow + the value below */}
                <text
                    x="50%"
                    y="46%"
                    textAnchor="middle"
                    fill="var(--muted-foreground)"
                    fontSize="10"
                    letterSpacing="1.6"
                    style={{ textTransform: "uppercase" }}
                >
                    {hoverId
                        ? slices.find((s) => s.id === hoverId)?.name ?? centerLabel
                        : centerLabel}
                </text>
                <text
                    x="50%"
                    y="58%"
                    textAnchor="middle"
                    fill="var(--foreground)"
                    fontSize="22"
                    fontWeight={500}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                >
                    {hoverId
                        ? formatShort(
                              slices.find((s) => s.id === hoverId)?.value ?? 0
                          )
                        : centerValue ?? formatShort(total)}
                </text>
            </svg>

            {/* Chip legend — wraps under the donut, drillable chips show a > arrow */}
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5">
                {slices.map((s) => {
                    const drillable = !!s.drillable;
                    return (
                        <button
                            key={s.id}
                            type="button"
                            onMouseEnter={() => setHoverId(s.id)}
                            onMouseLeave={() => setHoverId(null)}
                            onClick={() => onSelect?.(s)}
                            className={cn(
                                "inline-flex items-center gap-1.5 text-[11px] transition-colors",
                                drillable || onSelect
                                    ? "text-muted-foreground hover:text-foreground"
                                    : "text-muted-foreground cursor-default"
                            )}
                        >
                            <span
                                className="size-1.5 rounded-full"
                                style={{ backgroundColor: s.color }}
                            />
                            <span>{s.name}</span>
                            {drillable && (
                                <ChevronRight className="size-3 text-muted-foreground/60" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function formatShort(n: number): string {
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
