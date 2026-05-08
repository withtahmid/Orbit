import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Two distinct families of "money flow" numbers, both shown across the
 * Overview and Analytics surfaces. The choice is URL-persisted so a
 * link captures the view the user was reading.
 *
 *   - `cash`         — Money entering or leaving this space's accounts.
 *                      Includes cross-space transfer principal as
 *                      inflow/outflow. Matches what the bank ledger
 *                      shows; balance trend agrees with this.
 *
 *   - `operational`  — True income vs expense. Excludes all transfer
 *                      principal regardless of direction; transfer
 *                      fees still count as expense (real money to the
 *                      bank). The "did I actually earn / spend" view.
 */
export type MetricMode = "cash" | "operational";

/**
 * URL-persisted metric mode (`?metric=cash|operational`). Each view
 * declares its own default — for example Cash Flow defaults to `cash`
 * (matches the bank-balance reading) while Spending Trends defaults
 * to `operational` (true expense, transfer principal excluded).
 *
 * When a view's `defaultMode` is in effect we don't write the URL —
 * keeps shared links clean. The opposite mode always writes `?metric`
 * so the choice persists across reloads and across cards.
 *
 * Trade-off: on a page hosting two views with different defaults
 * (e.g., Overview's Cash Flow + Spending Trends cards) and no URL
 * param, the two cards render in different modes by design. The
 * moment the user clicks any toggle, the URL gets written and both
 * cards converge to the chosen mode.
 */
export function useMetricMode(defaultMode: MetricMode = "cash"): {
    mode: MetricMode;
    setMode: (m: MetricMode) => void;
} {
    const [params, setParams] = useSearchParams();
    const raw = params.get("metric");
    const mode: MetricMode =
        raw === "operational"
            ? "operational"
            : raw === "cash"
              ? "cash"
              : defaultMode;

    const setMode = useCallback(
        (m: MetricMode) => {
            setParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    if (m === defaultMode) next.delete("metric");
                    else next.set("metric", m);
                    return next;
                },
                { replace: true }
            );
        },
        [setParams, defaultMode]
    );

    return { mode, setMode };
}

/**
 * Segmented `Cash | Operational` toggle. Designed to sit in a card
 * header or alongside `<PeriodChip>` in the actions slot of an
 * analytics view. Drives `useMetricMode` directly — no prop wiring.
 */
export function MetricToggle({ className }: { className?: string }) {
    const { mode, setMode } = useMetricMode();
    return (
        <div
            role="tablist"
            aria-label="Metric mode"
            className={cn(
                "inline-flex h-9 items-center rounded-md border border-border bg-card p-0.5 text-[12.5px]",
                className
            )}
        >
            <ModeButton
                active={mode === "cash"}
                onClick={() => setMode("cash")}
                label="Cash"
                title="Inflow / outflow including cross-space transfers — matches bank balance"
            />
            <ModeButton
                active={mode === "operational"}
                onClick={() => setMode("operational")}
                label="Operational"
                title="True income / expense — excludes transfer principal"
            />
        </div>
    );
}

function ModeButton({
    active,
    onClick,
    label,
    title,
}: {
    active: boolean;
    onClick: () => void;
    label: string;
    title: string;
}) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            title={title}
            onClick={onClick}
            className={cn(
                "h-8 rounded px-3 transition-colors",
                active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
            )}
        >
            {label}
        </button>
    );
}
