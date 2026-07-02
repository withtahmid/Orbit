---
name: budget-detail-donut-undecodable
description: BudgetDetailPage "Where it went" donut is rendered with hideLegend+hideTooltip, leaving color-only wedges no user can decode
metadata:
  type: project
---

On BudgetDetailPage.tsx the "Where it went" spend-by-category donut is rendered as
`<Donut data={donutSlices} centerLabel="Spent" ... hideLegend hideTooltip />` (around line 1267).

PARTIALLY FIXED: `Donut` (components/shared/charts/Donut.tsx) now builds a `summaryLabel` useMemo
(`"{centerLabel} {total}. Breakdown: {name} {value}, ..."`) and applies `role="img"` + `aria-label={summaryLabel}`
to the chart's outer container div (line ~139-144). So screen readers now get the full breakdown as text even
when hideLegend+hideTooltip are set. Sighted-touch users still can't decode individual wedges (no tap tooltip),
but the value story is no longer silent to AT.

REMAINING (pre-existing, NOT introduced by the aria fix, affects ALL Donut instances incl. OverviewPage):
recharts@3.8.1 Pie defaults `rootTabIndex: 0` (verified es6/polar/Pie.js:572), rendering the inner
`<g class="recharts-pie" tabindex="0">` as a keyboard-focusable group with no role and no accessible name.
The parent `role="img"` does NOT remove it from tab order (tabindex is DOM-based, independent of the a11y tree),
so keyboard users hit an empty, nameless focus stop on every donut. The outer `<svg>` is clean
(RootSurface only sets role="application"/tabindex when `accessibilityLayer` is passed, which we don't).
Sectors themselves are `tabindex="-1"` (not focusable). Fix if ever addressed: pass `rootTabIndex={-1}` to `<Pie>`.
Minor/non-blocking.

**How to apply:** The SR gap is resolved. If asked to improve further, the remaining items are (a) a tap
tooltip for sighted-touch wedge identity, and (b) `rootTabIndex={-1}` on the `<Pie>` to kill the empty focus stop.
Related: [[budget_detail_page]], [[budget_detail_row3_breakpoint_trap]], [[envelope_color_contrast_custom_hex]].
