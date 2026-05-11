---
name: Transfer fee category rollup
description: Transfer fees use a separate fee_expense_category_id — easy to miss in aggregations
type: project
---

Transactions of `type='transfer'` can carry a `fee_amount` and a `fee_expense_category_id`. The fee is a real outflow from the source account and rolls up to the envelope referenced by `fee_expense_category_id`, NOT `expense_category_id` (which is null on transfers).

**Why:** Banks/FX/ATMs skim a fee on top of the transfer. The app records this as a single transaction with both the body and the fee, so the user only enters one row but the fee shows up under whichever expense category they assigned it to.

**How to apply:**
- Any envelope/category aggregation that wants to be "fee-aware" must UNION transfer-with-fee rows joined on `fee_expense_category_id`, in addition to expense rows joined on `expense_category_id`. See `envelopeUtilization.mts` and `listBySpaceWithUsage.mts` for the canonical pattern.
- `categoryBreakdown` does this; `topCategories` and similar should be checked.
- A category filter on the transactions list view does NOT match transfers whose fee category matches the filter — the list filter uses `expense_category_id`. That's not necessarily a bug, but be aware when totals don't match between list and analytics.
- When summing "spent by category", subtree rollups must aggregate from the leaf-level direct values; flat `spent_total` is per-row direct, not subtree-rolled.
