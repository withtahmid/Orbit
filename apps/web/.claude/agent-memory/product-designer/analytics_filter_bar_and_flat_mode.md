---
name: analytics-filter-bar-and-flat-mode
description: Shared analytics filter bar (env/acc/cat) + CategoriesView Tree⇄Flat toggle — canonical patterns and the recurring traps the design has to keep solving.
metadata:
  type: project
---

The analytics suite (Trends, Spending-by-category, Spending-calendar/Heatmap)
shares one filter bar via `AnalyticsFilterBar.tsx` + `useAnalyticsFilters.ts`
(under `apps/web/src/pages/space/analytics/components/`). State lives in URL
params `env`/`acc`/`cat` (shareable). Server semantics doc lives in
`apps/server/src/procedures/analytics/utils/trendsFilters.mts`:
- envelope filter drops `envelop_id IS NULL` rows; account filter = "money
  leaving source_account_id"; category filter expands to subtree + drops
  transfers.

**Canonical dimension visibility per page:**
- All three dimensions on real spaces for Trends + Heatmap.
- Spending-by-category page hides the **Categories** dimension on purpose
  (`useAnalyticsFilters({ categories: false })`) — the tree drill / flat list
  IS the category selection and owns the `cat` param. Cousin of
  [[analytics-categories-classification-only]].
- Personal `/s/me` collapses to **Accounts-only** on every page (no envelopes
  /categories — virtual space owns none). Personal twins accept only
  `accountIds`, intersected with owned via `intersectAccountIds`. Correct per
  [[personal-space-unallocated-misframe]].

**Recurring design traps in this area (reconfirm before changing):**
1. Flat-mode donut center uses the GRAND total (`rootTotal`) while
   `flatDonutData` is only top-12 slices → ring doesn't sum to center.
   Fix is an "Other (N)" reconciling slice, NOT relabeling the center.
2. Recurring-bill dots on the calendar are intentionally UNFILTERED (the
   cadence detector is a merchant-stream property, not a slice). Correct in
   principle but reads as a bug when cells dim and dots stay — suppress
   dots+legend while a filter is active.
3. `flat` and `cat` are independent URL flags; flat ignores `cat` but doesn't
   clear it, so shared flat links carry a dormant drill focus. Clear `cat`
   when entering flat mode.
4. KPI/subtitle copy must branch on flat mode (line ~481 in CategoriesView is
   the established pattern — apply it to ALL strings, esp. "Largest share").

**Product judgment confirmed (2026-06-30):** hiding Categories on the category
page, personal Accounts-only collapse, and Heatmap exposing all three
dimensions are all correct. The shared-hook extraction is the right
architecture (kills Trends-vs-others divergence risk).
