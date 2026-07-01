---
name: donut-uncategorized-gap
description: BudgetDetailPage "Where it went" donut now RECONCILES to this-month spend via an Uncategorized wedge; catTotal == periodSpend by cadence
metadata:
  type: project
---

`categoryBreakdown.mts` filters `expense_category_id IS NOT NULL`, so uncategorized spend is excluded from every `subtree_total`. Historically this made the donut center (`catTotal` = Σ root subtreeTotals = categorized only) fall short of hero "Spent".

RESOLVED in the envelope-detail redesign (branch `envelop-details-update`). BudgetDetailPage now pushes an explicit "Uncategorized" wedge so the donut reconciles to *this-month* spend:
- `periodSpend = cadence==="monthly" ? envelope.consumed : Σ(daily.current)` — monthly `consumed` is already period-windowed; rolling `consumed` is LIFETIME so it uses the summed daily series instead (which equals the chart's cumulative endpoint `cur[today-1]`, since future buckets are 0).
- `uncat = round((periodSpend − categorized)*100)/100`, pushed only if `> 0.005` (never negative).
- Therefore `catTotal = categorized + uncat = periodSpend`: donut center = this-month spend for BOTH cadences, matching the chart above (rolling) and the hero (monthly). Verified correct.

**Why:** the earlier gap was an intent/labeling mismatch between categoryBreakdown and envelopeUtilization; the redesign closed it with the Uncategorized-wedge option this note previously recommended.
**How to apply:** When reviewing "Where it went", confirm the cadence switch on `periodSpend` survives — swapping rolling back to `consumed` would re-introduce a lifetime-vs-this-month mismatch (donut would overstate vs the this-month chart). Sub-cent `catTotal` vs `periodSpend` drift from the 2-decimal `uncat` round is invisible under `money0`. See [[trend_subtree]], [[category_breakdown_semantics]].
