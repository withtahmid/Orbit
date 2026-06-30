import { createContext, useContext } from "react";
import type { CursorPeriod, Granularity } from "@/lib/dates";
import type { MetricMode } from "@/components/shared/MetricMode";
import type { useCurrentSpace } from "@/hooks/useCurrentSpace";
import type { CockpitTab } from "@/hooks/useCockpitState";

type Space = ReturnType<typeof useCurrentSpace>["space"];

/**
 * Everything a cockpit tab panel needs to query, derived once by the
 * cockpit page from `useCockpitState` + `useMetricMode`. Panels read this
 * instead of calling `usePeriod`/`useMetricMode` themselves, so the single
 * time control drives every panel. Each panel still runs its own dual
 * `analytics.*` / `personal.*` query gated by `space.isPersonal` — the
 * context provides the inputs, not the query.
 */
export interface CockpitValue {
    space: Space;
    granularity: Granularity;
    anchor: Date;
    /** Resolved focus window { start, end (exclusive), bucket }. */
    period: CursorPeriod;
    /** True when the cursor is on the current (latest) period. */
    isCurrent: boolean;
    mode: MetricMode;
    /** Calendar year of the anchor — for year-scoped procedures
     *  (yearReport, trends.yearOverYear). */
    year: number;
    /** Trailing-from-now window in days for `unbudgetedTrend`-style panels,
     *  scaled by granularity (day/week→30, month→90, year→365). */
    lookbackDays: number;
    /** A trailing N-month window ending at the focused period — for
     *  "context/trend" panels (cursor unchanged). bucket is "month". */
    trailingMonths: (n: number) => { start: Date; end: Date };
    /** Jump to a tab (used by Overview's "→" panel links). */
    setTab: (tab: CockpitTab) => void;
}

const CockpitContext = createContext<CockpitValue | null>(null);

export const CockpitProvider = CockpitContext.Provider;

export function useCockpit(): CockpitValue {
    const ctx = useContext(CockpitContext);
    if (!ctx) throw new Error("useCockpit must be used within a CockpitProvider");
    return ctx;
}
