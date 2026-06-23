---
name: budgeting-model
description: Simplified budgeting calc invariants after migration 048_simplify_budgeting (the model audited calc procedures must agree on).
metadata:
  type: project
---

Migration 048 collapsed `envelop_allocations` to ONE row per (envelope, period).

- Monthly (`cadence='monthly'`): one row per APP_TZ month, `period_start` = month-start date, `amount` = absolute total (not a delta). Resets each period — no carry.
- Rolling/goal (`cadence='none'`): one lifetime row, `period_start IS NULL`, `amount` = lifetime pool. Match on IS NULL, never a date range.
- Allocate/deallocate/transfer = accumulating UPSERT (`amount = amount + delta`) on the `(envelop_id, period_start) NULLS NOT DISTINCT` unique index.

Money invariants every reader must agree on:
- `remaining = allocated − consumed`.
- `held = GREATEST(0, allocated − consumed)` per envelope, summed.
- `unallocated = spendable − Σheld`; `spendable = Σ(asset bal) − Σ(liability bal)`, locked excluded.
- `lifetimeOverrun` (rolling only) = `GREATEST(0, lifetime consumed − lifetime allocated)`.
- `pctSaved` = clamp01(lifetimeFunded / targetAmount), null when target ≤ 0.

PG session = Asia/Dhaka, so SQL `date_trunc('month', NOW())::date` aligns with JS `periodWindow.mts` APP_TZ boundaries. Removed: borrow, carry_policy, budget_mode/strict, reckoning, per-account allocation.

Files that must produce the SAME held/unallocated: `analytics/spaceSummary.mts`, `allocation/utils/resolveSpaceUnallocated.mts`, `personal/summary.mts`.
