import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { colorForId } from "@/lib/entityStyle";

export interface AllocationFlowSegment {
    id: string;
    name: string;
    value: number;
    color?: string;
}

export interface AllocationFlowRow {
    id: string;
    name: string;
    color?: string;
    /** Icon element to show before the row label. */
    leading?: React.ReactNode;
    /** Segments of this row — e.g., per-account breakdown for an envelope. */
    segments: AllocationFlowSegment[];
    /** Optional right-side value (shown after the bar) — defaults to sum of segments. */
    rightLabel?: string;
    onClick?: () => void;
}

interface Props {
    rows: AllocationFlowRow[];
    /** Max value across all rows' total — sets the reference scale. */
    scale?: number;
    className?: string;
    /** Size of each bar row. */
    compact?: boolean;
    emptyLabel?: string;
}

/**
 * Horizontal stacked-bar visualization for (envelope × account) type
 * breakdowns. Each row is one envelope (or account); each segment within
 * is one account (or envelope). Segments share color with their entity so
 * the same partition always reads the same across pages.
 *
 * Widths are normalized to the max row total so users can compare absolute
 * sizes across rows visually. A hover tooltip surfaces segment names.
 */
export function AllocationFlowBar({
    rows,
    scale,
    className,
    compact = false,
    emptyLabel = "Nothing to show yet",
}: Props) {
    const resolvedScale = useMemo(() => {
        if (scale && scale > 0) return scale;
        let max = 0;
        for (const r of rows) {
            const total = r.segments.reduce((acc, s) => acc + s.value, 0);
            if (total > max) max = total;
        }
        return max || 1;
    }, [rows, scale]);

    if (rows.length === 0) {
        return (
            <p className={cn("text-sm text-muted-foreground", className)}>{emptyLabel}</p>
        );
    }

    return (
        <div className={cn("grid gap-3", className)}>
            {rows.map((row) => {
                const total = row.segments.reduce((acc, s) => acc + s.value, 0);
                const widthPct = (total / resolvedScale) * 100;
                const interactive = !!row.onClick;
                return (
                    <button
                        key={row.id}
                        type="button"
                        onClick={row.onClick}
                        disabled={!interactive}
                        className={cn(
                            "group grid w-full gap-1 text-left",
                            interactive &&
                                "rounded-md p-1 -m-1 transition-colors hover:bg-accent/30"
                        )}
                    >
                        <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="flex min-w-0 items-center gap-2">
                                {row.leading}
                                <span className="truncate font-medium">{row.name}</span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                {row.rightLabel ?? formatMoney(total)}
                            </span>
                        </div>
                        <div
                            className={cn(
                                "flex overflow-hidden rounded-md bg-secondary/50",
                                compact ? "h-2" : "h-3"
                            )}
                            style={{ width: `${Math.max(2, widthPct)}%` }}
                        >
                            {row.segments.map((s, i) => {
                                const segPct = total > 0 ? (s.value / total) * 100 : 0;
                                return (
                                    <span
                                        key={s.id + "-" + i}
                                        title={`${s.name}: ${formatMoney(s.value)}`}
                                        style={{
                                            width: `${segPct}%`,
                                            backgroundColor: s.color ?? colorForId(s.id),
                                        }}
                                        className="h-full transition-opacity hover:opacity-80"
                                    />
                                );
                            })}
                        </div>
                        {row.segments.length > 1 && !compact && (
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                {row.segments.map((s, i) => (
                                    <span
                                        key={s.id + "-legend-" + i}
                                        className="inline-flex items-center gap-1"
                                    >
                                        <span
                                            className="size-2 rounded-sm"
                                            style={{
                                                backgroundColor: s.color ?? colorForId(s.id),
                                            }}
                                        />
                                        <span className="truncate">{s.name}</span>
                                        <span className="tabular-nums">
                                            {formatMoney(s.value)}
                                        </span>
                                    </span>
                                ))}
                            </div>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
