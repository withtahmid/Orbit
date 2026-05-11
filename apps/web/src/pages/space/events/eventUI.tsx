import type { ReactNode } from "react";

const ICON_PATHS: Record<string, string> = {
    home: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
    plane: "m3 13 7-1 4-7 2 1-2 7 7 4-1 2-7-3-3 4-2 1 1-3z",
    gift: "M4 11h16v9H4zM3 7h18v4H3zm9-3a2 2 0 0 0-2 2v1h4V6a2 2 0 0 0-2-2zm0 0v16",
    heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
    star: "m12 3 2.7 5.6 6 .7-4.4 4.3 1.2 6.1L12 16.8 6.5 19.7l1.2-6.1L3.3 9.3l6-.7z",
    "calendar-days": "M5 5h14v14H5zM5 9h14M9 3v4M15 3v4",
    calendar: "M5 5h14v14H5zM5 9h14M9 3v4M15 3v4",
    dot: "M12 12h.01",
};

export function DesignIcon({
    name,
    size,
    color,
}: {
    name: string;
    size: number;
    color: string;
}) {
    const d = ICON_PATHS[name] ?? ICON_PATHS.calendar;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d={d} />
        </svg>
    );
}

export function EntityAvatar({
    icon,
    colorVar,
    size = 32,
}: {
    icon: string;
    colorVar: string;
    size?: number;
}) {
    return (
        <span
            style={{
                width: size,
                height: size,
                borderRadius: 8,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: `color-mix(in oklab, ${colorVar} 18%, transparent)`,
                border: `1px solid color-mix(in oklab, ${colorVar} 30%, transparent)`,
                color: colorVar,
                flexShrink: 0,
            }}
        >
            <DesignIcon name={icon} size={size * 0.5} color={colorVar} />
        </span>
    );
}

export function Money({
    amount,
    variant = "neutral",
    signed = false,
    size = 13,
    weight = 500,
    decimals = 2,
}: {
    amount: number;
    variant?: "neutral" | "income" | "expense" | "muted";
    signed?: boolean;
    size?: number;
    weight?: number;
    decimals?: number;
}) {
    const colorMap: Record<string, string> = {
        income: "var(--income)",
        expense: "var(--expense)",
        muted: "var(--fg-3)",
        neutral: "var(--fg)",
    };
    const abs = Math.abs(amount).toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
    let text = abs;
    if (amount < 0) text = "−" + abs;
    else if (signed && amount > 0) text = "+" + abs;
    return (
        <span
            className="tabular"
            style={{ color: colorMap[variant], fontSize: size, fontWeight: weight }}
        >
            {text}
        </span>
    );
}

export function Skeleton({ height = 16 }: { height?: number }) {
    return (
        <div
            style={{
                width: "100%",
                height,
                borderRadius: 12,
                background:
                    "linear-gradient(90deg, var(--bg-elev-1), var(--bg-elev-2), var(--bg-elev-1))",
                backgroundSize: "200% 100%",
                animation: "ov-shimmer 1.6s ease-in-out infinite",
            }}
        />
    );
}

export function Metric({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="ev-metric">
            <span className="eyebrow">{label}</span>
            <div style={{ marginTop: 4 }}>{value}</div>
        </div>
    );
}

/* Render a horizontal progress bar comparing spent vs. estimated.
   Color tier: brand <= 80%, gold 80-100%, expense > 100%. */
export function EstimateProgressBar({
    spent,
    estimate,
    height = 6,
}: {
    spent: number;
    estimate: number;
    height?: number;
}) {
    const safeEstimate = estimate > 0 ? estimate : 1;
    const pct = (spent / safeEstimate) * 100;
    const clamped = Math.min(Math.max(pct, 0), 100);
    const color =
        pct > 100
            ? "var(--expense)"
            : pct >= 80
              ? "var(--gold)"
              : "var(--brand)";
    return (
        <div
            style={{
                width: "100%",
                height,
                borderRadius: 999,
                background:
                    "color-mix(in oklab, var(--line) 60%, transparent)",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    width: `${clamped}%`,
                    height: "100%",
                    background: color,
                    transition: "width 200ms ease",
                }}
            />
        </div>
    );
}
