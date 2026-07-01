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

Window boundary subtleties (verified correct):
- `spaceSummary` and `envelopeUtilization` both scope monthly allocated/consumed to the requested `[periodStart, periodEnd)` (spaceSummary was fixed on branch budget-bug-fix-2 — was hardcoded current-month). They now compute IDENTICAL per-envelope allocated & consumed for the same window.
- ALLOCATED filter compares `a.period_start` (a DATE col) `>= periodStart::date AND < periodEnd::date` — casting the window to date is correct because period_start is date-typed and month-aligned.
- CONSUMED filter compares `t.transaction_datetime` (timestamptz) — envelopeUtilization compares against the raw `periodStart`/`periodEnd` timestamps; spaceSummary's fix compares against `p_start`/`p_end` which are `::date`-CAST. Under Asia/Dhaka session tz these coincide ONLY because the web always sends month-aligned midnight-Dhaka boundaries (startOfMonth/endOfMonth). A date cast of a midnight-Dhaka timestamp yields the same calendar day, and comparing timestamptz to a date promotes the date to 00:00 Dhaka = the same instant. So results match. CAVEAT: if a non-midnight `periodEnd` were ever passed to spaceSummary, its `::date` cast would silently truncate the time-of-day (include/exclude whole days differently from envelopeUtilization). Not a live bug — no caller does this — but a latent divergence. spaceSummary consumed filter is at spaceSummary.mts:136-137.
- `resolveSpaceUnallocated` stays pinned to current month (DATE_TRUNC('month', NOW())); it only matches spaceSummary when the viewed window IS the current month. That is intended (its transfer/guard callers only care about now).
