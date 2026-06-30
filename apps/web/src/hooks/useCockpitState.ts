import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
    resolveCursorPeriod,
    stepCursorAnchor,
    isCurrentCursor,
    fromInputDate,
    toInputDate,
    type Granularity,
    type CursorPeriod,
} from "@/lib/dates";

export type CockpitTab =
    | "overview"
    | "cashflow"
    | "spending"
    | "accounts"
    | "budget"
    | "insights";

export const COCKPIT_TABS: CockpitTab[] = [
    "overview",
    "cashflow",
    "spending",
    "accounts",
    "budget",
    "insights",
];

const GRANULARITIES: Granularity[] = ["day", "week", "month", "year", "custom"];
const DEFAULT_GRANULARITY: Granularity = "month";
const DEFAULT_TAB: CockpitTab = "overview";

export interface CockpitState {
    granularity: Granularity;
    /** Raw anchor date (start re-derived per granularity in `period`). */
    anchor: Date;
    /** Resolved window + intra-period bucket. */
    period: CursorPeriod;
    tab: CockpitTab;
    /** True when the cursor sits on the current (latest) period — disables
     *  the "next" stepper and keeps the bare URL clean. */
    isCurrent: boolean;
    setGranularity: (g: Granularity) => void;
    /** Step the anchor ±1 unit of the current granularity (no-op for custom). */
    step: (dir: number) => void;
    /** Jump the anchor back to the current period ("This month/week/…"). */
    goToCurrent: () => void;
    /** Set a custom range. `end` is exclusive (DateRangePicker contract). */
    setCustom: (start: Date, end: Date) => void;
    setTab: (tab: CockpitTab) => void;
}

/**
 * URL-persisted cockpit cursor. Reads `?g=`, `?anchor=YYYY-MM-DD`,
 * `?from/?to` (custom), and `?tab=`. Deliberately on a different
 * query-param namespace from `usePeriod` (`?period=`) so a cockpit deep
 * link and a Transactions deep link never collide. Defaults
 * (month / current / overview) are never written, keeping bare links clean.
 */
export function useCockpitState(): CockpitState {
    const [params, setParams] = useSearchParams();

    const granularity = useMemo<Granularity>(() => {
        const g = params.get("g");
        return g && GRANULARITIES.includes(g as Granularity)
            ? (g as Granularity)
            : DEFAULT_GRANULARITY;
    }, [params]);

    const anchor = useMemo(
        () => fromInputDate(params.get("anchor") ?? "") ?? new Date(),
        [params]
    );
    const customStart = useMemo(
        () => fromInputDate(params.get("from") ?? "") ?? undefined,
        [params]
    );
    const customEnd = useMemo(
        () => fromInputDate(params.get("to") ?? "") ?? undefined,
        [params]
    );

    const tab = useMemo<CockpitTab>(() => {
        const t = params.get("tab");
        return t && COCKPIT_TABS.includes(t as CockpitTab)
            ? (t as CockpitTab)
            : DEFAULT_TAB;
    }, [params]);

    const period = useMemo(
        () =>
            resolveCursorPeriod(granularity, anchor, {
                start: customStart,
                end: customEnd,
            }),
        [granularity, anchor, customStart, customEnd]
    );

    const isCurrent = useMemo(
        () => isCurrentCursor(granularity, anchor),
        [granularity, anchor]
    );

    /** Single writer that applies the clean-URL rules. */
    const commit = useCallback(
        (next: {
            granularity?: Granularity;
            anchor?: Date;
            tab?: CockpitTab;
            from?: Date;
            to?: Date;
        }) => {
            setParams(
                (prev) => {
                    const p = new URLSearchParams(prev);
                    const g = next.granularity ?? granularity;
                    if (g === DEFAULT_GRANULARITY) p.delete("g");
                    else p.set("g", g);

                    const a = next.anchor ?? anchor;
                    if (g === "custom" || isCurrentCursor(g, a)) p.delete("anchor");
                    else p.set("anchor", toInputDate(a));

                    if (g === "custom") {
                        if (next.from) p.set("from", toInputDate(next.from));
                        if (next.to) p.set("to", toInputDate(next.to));
                    } else {
                        p.delete("from");
                        p.delete("to");
                    }

                    const t = next.tab ?? tab;
                    if (t === DEFAULT_TAB) p.delete("tab");
                    else p.set("tab", t);
                    return p;
                },
                { replace: true }
            );
        },
        [setParams, granularity, anchor, tab]
    );

    const setGranularity = useCallback(
        (g: Granularity) => {
            if (g === "custom") {
                // Seed the custom range from the currently focused window so
                // switching to "Custom…" opens on a sensible range, not empty.
                commit({
                    granularity: "custom",
                    from: customStart ?? period.start,
                    to: customEnd ?? period.end,
                });
            } else {
                commit({ granularity: g });
            }
        },
        [commit, customStart, customEnd, period.start, period.end]
    );

    const step = useCallback(
        (dir: number) => {
            if (granularity === "custom") return;
            commit({ anchor: stepCursorAnchor(granularity, anchor, dir) });
        },
        [commit, granularity, anchor]
    );

    const goToCurrent = useCallback(() => commit({ anchor: new Date() }), [commit]);

    const setCustom = useCallback(
        (start: Date, end: Date) => commit({ granularity: "custom", from: start, to: end }),
        [commit]
    );

    const setTab = useCallback((t: CockpitTab) => commit({ tab: t }), [commit]);

    return {
        granularity,
        anchor,
        period,
        tab,
        isCurrent,
        setGranularity,
        step,
        goToCurrent,
        setCustom,
        setTab,
    };
}
