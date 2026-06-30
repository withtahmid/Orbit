---
name: analytics-ui-conventions
description: UI/responsive conventions and recurring gotchas in apps/web analytics views (filter bar, CategoriesView, HeatmapView, shared shells)
metadata:
  type: project
---

Analytics detail views live under `src/pages/space/analytics/views/*` and share a shell `_AnalyticsLayout.tsx` (back link + `PageHeader` + body) plus `components/AnalyticsFilterBar.tsx` and `components/useAnalyticsFilters.ts` (URL-backed `env`/`acc`/`cat` params).

**Why:** recurring review of these files; recording the conventions so future audits go straight to the known fragile spots.

**How to apply:**
- Mobile touch-target pattern across analytics: `h-9 sm:h-7` (and `text-sm sm:text-[12px]`) gives 36px tall triggers on mobile, compact on desktop. Filter chips and Clear-all follow it. Flag any new analytics control that uses a fixed small height (e.g. ViewModeToggle's `px-2.5 py-1` is ~28px — below 44px guideline).
- `PageHeader.tsx` renders `actions` inside a NON-wrapping `flex items-center gap-2` (line ~27). Any view passing 2+ controls into `actions` must add its own `flex-wrap` wrapper or it overflows on narrow phones. CategoriesView (ViewModeToggle + PeriodChip) is the case that hits this.
- Ranked-list rows reuse `grid-cols-[24px_minmax(0,1fr)_auto] sm:grid-cols-[24px_minmax(0,1fr)_minmax(80px,1fr)_104px_72px_16px]`. Mobile hides bar/delta/chevron and shows money inline. The name/subtitle column has `min-w-0`, but nested flex rows inside it (the subtitle line) re-introduce an unconstrained flex context — `truncate` there needs its own `min-w-0` to engage. Flat mode rides the long ancestor path in the `envelopeName` subtitle slot, so this is where long-path clipping shows up.
- Filter dropdowns: ChipMultiSelect `w-64`, CategoryMultiSelect `w-72` (288px) with `align="start"`. Radix popper repositions to avoid right-edge clipping; names use `truncate` so they degrade gracefully. Search `Input`s are `h-7 text-xs` (sub-16px → iOS zoom-on-focus risk, minor).
- HeatmapView month grid: `grid-cols-2 md:grid-cols-3 xl:grid-cols-4`; day cells are tiny `aspect-square` with spend in native `title` only (no touch affordance) — pre-existing, generally out of scope.
