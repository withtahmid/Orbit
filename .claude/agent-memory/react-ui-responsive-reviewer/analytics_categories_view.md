---
name: analytics-categories-view
description: Layout/responsive structure and recurring fragility points of the analytics CategoriesView donut page.
metadata:
  type: project
---

`apps/web/src/pages/space/analytics/views/CategoriesView.tsx` — donut + ranked-spend page for "Spending by category". Drills the expense_category tree (root categories → sub-categories). Envelopes are NOT a drill level (removed); envelope metadata is used only for the ranked-row subtitle and the leaf-card "Open envelope" shortcut.

**Layout shells:**
- Breadcrumb pill: `flex flex-wrap items-center gap-2 rounded-xl border ... px-3.5 py-2.5`. Right cluster (count text + "Up" button) uses `ml-auto` — fragile on `flex-wrap`: when ancestor chips wrap, the cluster orphans to its own line and `ml-auto` floats it far-right detached from the chain. Worse with deep category chains than the old shallow envelope level.
- Donut/list two-col: single column until `lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]`. Both tracks `minmax(0,…)` to prevent overflow. Good.
- Ranked row grid: mobile `grid-cols-[24px_minmax(0,1fr)_auto]`; `sm:grid-cols-[24px_minmax(0,1fr)_minmax(80px,1fr)_104px_72px_16px]`. Bar/money/delta/chevron gated behind `sm:`. Name+subtitle truncate correctly (`min-w-0` present).

**Recurring fragility:**
- BreadcrumbItem label has `truncate` but no max-width and the wrapping span lacks `min-w-0`, so long user-named categories don't actually truncate and can overflow horizontally on mobile.
- Drillability indicated only by chevron (hidden on mobile) + `opacity-90` — no mobile/SR affordance.

**Accessibility:**
- Ranked rows and breadcrumb items are real `<button>` (keyboard OK).
- DrillableDonut (`components/shared/charts/DrillableDonut.tsx`) slices are clickable `<g>` with no tabIndex/role/keydown inside `role="img"` — NOT keyboard accessible, but MITIGATED by the keyboard-accessible legend buttons below the chart that mirror every slice. Out of scope for page reviews; flag in the chart's own review.
