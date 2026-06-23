---
name: allocations-analytics-degenerate-post-collapse
description: analytics.allocations "By envelope"/"Drift" KPI broke when monthly allocations became per-month rows; all-time SUM is now unbounded
metadata:
  type: project
---

`analytics.allocations` (powers the Allocation map: "By envelope" bar panel + "Totals" Drift KPI) sums `envelop_allocations.amount` **all-time, no period filter**.

Fact (verified 2026-06-23 on `simplify-budgeting`): migration 048 made monthly allocations **one absolute row per (envelope, month)**. So all-time SUM for a monthly envelope = sum of every month's budget ever set (e.g. 300/mo × 12mo = 3600 shown as "committed budget"). The `drift.delta = assetBalanceSum − allocatedSum` then compares *current* assets against the *lifetime* sum of monthly budgets — grows unbounded each month, will show a large spurious negative "drift" / over-commitment for any space with monthly-envelope history.

**Why:** the all-time SUM semantics predate the collapse and were coherent when allocations were a delta-ledger you wrote once; the collapse changed row meaning but this query wasn't re-scoped. `envelopeUtilization` (period-scoped) is correct; only the `allocations` snapshot is wrong.

**How to apply:** when reviewing budgeting analytics, treat `analytics.allocations` "By envelope" + "Drift" as broken-for-monthly until it either (a) period-scopes monthly rows to the current month, or (b) the view is restricted to rolling/goal envelopes. Related: [[simplify_budgeting_review]] flagged Matrix/Allocations as degenerate; this is the precise mechanism.
