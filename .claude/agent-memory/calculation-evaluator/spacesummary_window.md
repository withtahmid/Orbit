---
name: spaceSummary envelope window is always "now"
description: spaceSummary held/unallocated ignore the input period window — always current calendar month via DATE_TRUNC('month', NOW())
type: project
---

`analytics.spaceSummary` takes `periodStart`/`periodEnd` inputs, but the envelope block (allocated/consumed/remaining → `unallocated`, `isOverAllocated`) hardcodes the month as `DATE_TRUNC('month', NOW())` in SQL (spaceSummary.mts ~L97-101). The input window is used ONLY by the income/expense flow block (~L226-227). So `unallocated` is ALWAYS "as of the current real calendar month", whatever window you pass.

**Why:** Held is a point-in-time cash concept; the simplified model (mig 048) resets monthly with no carry, so "held now" only makes sense for the live month.

**How to apply:**
- Any client that pairs spaceSummary's `unallocated` with per-envelope figures from `envelopeUtilization` (which DOES honor its window) must use the **current** month, or the two sources describe different periods. BudgetMonthPage's `heldDelta = unallocatedNow − Σ(...)` is only valid when the viewed month == current month; for past/future months `unallocatedNow` is current-month held while `e.consumed`/`e.allocated` are the viewed month → "Free after save" is wrong off-current-month.
- personal/summary has the same hardcoded-now envelope window.
