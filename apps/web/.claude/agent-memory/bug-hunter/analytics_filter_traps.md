---
name: analytics-filter-traps
description: Gotchas in the shared analytics filter bar (useAnalyticsFilters/AnalyticsFilterBar) and the trends filter SQL helpers.
metadata:
  type: project
---

Shared analytics filter bar lives in `apps/web/src/pages/space/analytics/components/` (`useAnalyticsFilters.ts`, `AnalyticsFilterBar.tsx`); SQL helpers in `apps/server/src/procedures/analytics/utils/trendsFilters.mts`. Used by TrendsView, CategoriesView (with `{categories:false}`), HeatmapView and their personal twins.

**Why these matter:**
- `intersectAccountIds` doc says callers MUST short-circuit on `[]`. The reason (OR'd `destination_account_id` predicates) ONLY applies to procedures with a transfer/destination branch. `personalSpendingHeatmap` short-circuits; `personalCategoryBreakdown` does NOT and that is CORRECT (it only has `source_account_id = ANY(...)`, so empty set → zero spend, all categories return zero). Don't "fix" the missing short-circuit in categoryBreakdown.
- `WITH RECURSIVE ${catCTE}` where catCTE is empty (`sql\`\``) yields `WITH RECURSIVE scope_accounts AS (...)` — VALID in Postgres (RECURSIVE keyword doesn't force any CTE to be recursive). Not a bug.
- Category filter on `spendingHeatmap` is applied to BOTH expense and transfer UNION branches; since transfers have `expense_category_id IS NULL`, the `IN (SELECT ...)` predicate drops the entire transfer branch when a category filter is active. Intended.

**How to apply:** When auditing these procedures, the empty-array `= ANY('{}')` pattern is always-false-never-errors and is used deliberately for "nothing matched → zeros." All array/value interpolation is via kysely `sql` template params — no injection surface.

**Pre-existing (NOT introduced by analytics-update):** HeatmapView reconstructs dates from APP_TZ `yyyy-MM-dd` keys via browser-local `new Date(y, m-1, d)` for `peakDate`, then displays peakDate via `formatInAppTz` — a tz round-trip that can shift the peak-day label by one day for browsers far east of Asia/Dhaka. See [[apptz_format_trap]]. This logic is unchanged from main.
