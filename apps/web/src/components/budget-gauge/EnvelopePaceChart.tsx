/* EnvelopePaceChart — a hand-rolled SVG cumulative chart for the envelope
 * detail page, in Orbit's editorial-dark style (matches the analytics
 * cumulative-race chart's aesthetic: dotted grid, area fill, today marker).
 *
 * It is intentionally "dumb": the page computes the data-space series per
 * cadence (spend vs. save) and passes points in data coordinates; this
 * component only maps them to pixels and draws. That keeps the cadence logic
 * (pace = 0→budget for monthly, start→target for goals, average for rolling)
 * in one readable place on the page rather than smeared into the renderer.
 */

import { useId } from "react";

export interface ChartPoint {
    x: number;
    y: number;
}

export interface EnvelopePaceChartProps {
    /** Data-space bounds. x is a position (day index / days-since-start). */
    xMax: number;
    yMax: number;
    /** Y values to draw gridlines + labels at. */
    yTicks: number[];
    /** X positions + labels for the axis. */
    xTicks: Array<{ x: number; label: string }>;
    /** The realized line (solid + area). */
    actual: ChartPoint[];
    /** The "follow this to stay on budget / reach the goal" guide (dashed). */
    pace?: ChartPoint[] | null;
    /** Where the current pace lands you (dotted). */
    projection?: ChartPoint[] | null;
    /** A faint reference (e.g. a typical cumulative shape). */
    average?: ChartPoint[] | null;
    /** Horizontal cap line (budget / target) + its label. */
    capY?: number | null;
    capLabel?: string;
    /** Vertical "today" marker at this x. */
    todayX?: number | null;
    /** Main line/area color (semantic health color from the page). */
    accent?: string;
    /** Projection line color. */
    projColor?: string;
    /** Y-axis tick formatter. */
    fmtY?: (v: number) => string;
    height?: number;
    ariaLabel?: string;
    /** "measured" (default) draws the actual line solid with an area fill.
     *  "synthetic" draws it dashed with no fill — for series that are an
     *  average trajectory, not real per-point history (e.g. goal funding,
     *  which has no per-deposit record), so it doesn't masquerade as data. */
    actualKind?: "measured" | "synthetic";
}

const W = 880;
const PL = 46;
const PR = 18;
const PT = 16;
const PB = 26;

export function EnvelopePaceChart({
    xMax,
    yMax,
    yTicks,
    xTicks,
    actual,
    pace,
    projection,
    average,
    capY,
    capLabel,
    todayX,
    accent = "var(--brand)",
    projColor = "var(--warn)",
    fmtY = (v) => `${v}`,
    height = 260,
    ariaLabel,
    actualKind = "measured",
}: EnvelopePaceChartProps) {
    const uid = useId().replace(/:/g, "");
    const H = height;
    const iw = W - PL - PR;
    const ih = H - PT - PB;
    const sx = xMax > 0 ? iw / xMax : 0;
    const sy = yMax > 0 ? ih / yMax : 0;
    const X = (x: number) => PL + x * sx;
    const Y = (y: number) => PT + ih - y * sy;

    const line = (pts: ChartPoint[]) =>
        pts.map((p, i) => `${i === 0 ? "M" : "L"} ${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(" ");
    const areaPath =
        actual.length > 1
            ? `${line(actual)} L ${X(actual[actual.length - 1].x).toFixed(1)} ${Y(0).toFixed(1)} L ${X(actual[0].x).toFixed(1)} ${Y(0).toFixed(1)} Z`
            : "";

    const fillId = `${uid}-fill`;
    const last = actual[actual.length - 1];
    const projLast = projection && projection.length ? projection[projection.length - 1] : null;

    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label={ariaLabel}
            style={{ display: "block", overflow: "visible" }}
        >
            <defs>
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={accent} stopOpacity="0.26" />
                    <stop offset="1" stopColor={accent} stopOpacity="0" />
                </linearGradient>
            </defs>

            {/* y gridlines + labels */}
            {yTicks.map((v) => (
                <g key={`y${v}`}>
                    <line
                        x1={PL}
                        x2={W - PR}
                        y1={Y(v)}
                        y2={Y(v)}
                        stroke="var(--line-soft)"
                        strokeDasharray="2 4"
                    />
                    <text
                        x={PL - 8}
                        y={Y(v) + 3}
                        textAnchor="end"
                        fontSize="11.5"
                        fill="var(--fg-4)"
                        fontFamily="var(--mono, ui-monospace, monospace)"
                    >
                        {fmtY(v)}
                    </text>
                </g>
            ))}

            {/* cap line (budget / target) */}
            {capY != null && (
                <>
                    <line
                        x1={PL}
                        x2={W - PR}
                        y1={Y(capY)}
                        y2={Y(capY)}
                        stroke="var(--expense)"
                        strokeOpacity="0.5"
                        strokeWidth="1"
                        strokeDasharray="1 3"
                    />
                    {capLabel && (
                        <text
                            x={W - PR}
                            y={Y(capY) - 5}
                            textAnchor="end"
                            fontSize="11"
                            fill="var(--expense)"
                            opacity="0.85"
                        >
                            {capLabel}
                        </text>
                    )}
                </>
            )}

            {/* typical-average reference (rolling) */}
            {average && average.length > 1 && (
                <path
                    d={line(average)}
                    stroke="var(--fg-3)"
                    strokeWidth="1.5"
                    strokeDasharray="1 3"
                    fill="none"
                    opacity="0.7"
                />
            )}

            {/* pace guide */}
            {pace && pace.length > 1 && (
                <path
                    d={line(pace)}
                    stroke="var(--fg-2)"
                    strokeWidth="1.5"
                    strokeDasharray="5 4"
                    fill="none"
                />
            )}

            {/* actual: area + line (fill + solid only when "measured"; a
                "synthetic" average trajectory is dashed with no fill) */}
            {areaPath && actualKind === "measured" && (
                <path d={areaPath} fill={`url(#${fillId})`} />
            )}
            {actual.length > 1 && (
                <path
                    d={line(actual)}
                    stroke={accent}
                    strokeWidth="2.5"
                    fill="none"
                    strokeLinejoin="round"
                    strokeDasharray={actualKind === "synthetic" ? "7 5" : undefined}
                />
            )}

            {/* projection */}
            {projection && projection.length > 1 && (
                <path
                    d={line(projection)}
                    stroke={projColor}
                    strokeWidth="2"
                    strokeDasharray="2 3"
                    fill="none"
                />
            )}

            {/* today marker */}
            {todayX != null && (
                <>
                    <line
                        x1={X(todayX)}
                        x2={X(todayX)}
                        y1={PT}
                        y2={PT + ih}
                        stroke="var(--fg-3)"
                        strokeDasharray="2 3"
                        opacity="0.5"
                    />
                    <text
                        x={X(todayX)}
                        y={PT - 3}
                        textAnchor="middle"
                        fontSize="11"
                        fill="var(--fg-3)"
                    >
                        TODAY
                    </text>
                </>
            )}

            {/* endpoint dots */}
            {last && (
                <circle
                    cx={X(last.x)}
                    cy={Y(last.y)}
                    r="4"
                    fill={accent}
                    stroke="var(--bg-elev-1)"
                    strokeWidth="2"
                />
            )}
            {projLast && (
                <circle cx={X(projLast.x)} cy={Y(projLast.y)} r="3.5" fill={projColor} />
            )}

            {/* x labels */}
            {xTicks.map((t, i) => (
                <text
                    key={`x${i}`}
                    x={X(t.x)}
                    y={H - 7}
                    textAnchor="middle"
                    fontSize="11.5"
                    fill="var(--fg-4)"
                >
                    {t.label}
                </text>
            ))}
        </svg>
    );
}

export default EnvelopePaceChart;
