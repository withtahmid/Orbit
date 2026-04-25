import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

/**
 * Progress bar.
 *
 * Normal mode: pass `value` (0–100) — renders a single emerald (or
 * `indicatorColor`) fill behind the track.
 *
 * Over mode: pass `spent` and `allocated`.  When `spent > allocated > 0`
 * the bar renders TWO segments inline — emerald up to the allocation line,
 * red past it — so the overspend magnitude is visible at a glance.
 * Falls back to normal mode if either value is missing or allocated <= 0.
 */
function Progress({
    className,
    value,
    indicatorClassName,
    indicatorColor,
    spent,
    allocated,
    ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
    indicatorClassName?: string;
    indicatorColor?: string;
    spent?: number;
    allocated?: number;
}) {
    // Over-state path — emerald + red two-segment render.  We build the two
    // segments inside a plain div; Radix's <Progress.Root> doesn't expose
    // slots for compound fills and its accessibility story here is a lie
    // (the "progress" is technically >100%).  Pick the right primitive for
    // the shape, fall back to the standard radix bar otherwise.
    if (spent != null && allocated != null && allocated > 0 && spent > allocated) {
        const goodPct = (allocated / spent) * 100;
        const overPct = 100 - goodPct;
        return (
            <div
                data-slot="progress-over"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={allocated}
                aria-valuenow={spent}
                aria-valuetext={`Over budget: ${spent} of ${allocated}`}
                className={cn("o-bar", className)}
            >
                <div
                    className="o-bar__fill o-bar__fill--good"
                    style={{ width: `${goodPct}%` }}
                />
                <div
                    className="o-bar__fill o-bar__fill--over"
                    style={{ width: `${overPct}%` }}
                />
            </div>
        );
    }

    return (
        <ProgressPrimitive.Root
            data-slot="progress"
            className={cn(
                "relative h-2 w-full overflow-hidden rounded-full bg-secondary",
                className
            )}
            value={value}
            {...props}
        >
            <ProgressPrimitive.Indicator
                data-slot="progress-indicator"
                className={cn(
                    "h-full w-full flex-1 bg-primary transition-all",
                    indicatorClassName
                )}
                style={{
                    transform: `translateX(-${100 - Math.min(100, value || 0)}%)`,
                    backgroundColor: indicatorColor,
                }}
            />
        </ProgressPrimitive.Root>
    );
}

export { Progress };
