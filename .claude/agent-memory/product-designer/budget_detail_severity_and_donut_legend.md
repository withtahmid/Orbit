---
name: budget-detail-severity-and-donut-legend
description: BudgetDetailPage two-tier severity traffic-light is sound; donut lost its sighted-user legend (aria-label only covers AT/touch)
metadata:
  type: project
---

Envelope Details page (`apps/web/src/pages/space/budgets/BudgetDetailPage.tsx` + `EnvelopeSpendChart.tsx` + shared `Donut.tsx`), third design pass 2026-07-02.

**Two-tier spend severity is canonical and coherent — do not reopen.** Green (`--income`, hue 158) = under pace; amber (`--warn`, hue 75) = ahead of pace but still under the month's total budget; red (`--expense`, hue 25) = spend has passed the whole month's budget. Applied consistently across hero pill ("On track"/"Trending over"/"Over budget"), the Pace-today KPI tile, and the chart dot/bracket/pulse/label. Archived envelopes mute all three to `--fg-3` gray. Chart `isOverBudget` (`cur[today-1] > budget`) and hero `over` (`consumed > total`) flip at the same threshold for the current month.
**Why:** rounds 1-2 collided over-pace red with over-budget red; two-tier split resolved it and reads as a real traffic light because the three hues are well-separated.
**How to apply:** treat this green→amber→red mapping as the house pattern for any budget-pace signal; reuse it, don't invent a new one. One open nit: the chart's inline label stays "Today · over pace" even in the red state (should say "over budget") — cosmetic.

**Donut "Where it went" is rendered `hideLegend` + `hideTooltip`.** The aria-label summary (Donut.tsx:91-96, built from the drawn `normalized` array) restores name+value parity for screen-reader/touch users. But sighted non-hovering users now get a bare colored donut with NO key — they must hover each wedge to decode it. The code comment at BudgetDetailPage.tsx:294-295 still claims "the full list lives in the legend beside it," which is now false (no legend exists).
**Why:** the visual legend was deliberately removed; the aria-label fixed the AT half but not the sighted-static half.
**How to apply:** if restoring, add a compact inline swatch+name+value legend under the donut (220px chart in a stretch column has room) and fix the stale comment. This is the one item from this pass worth acting on. Relates to [[envelope_detail_rolling_gap]] (goals want funding-history not a spend donut).
