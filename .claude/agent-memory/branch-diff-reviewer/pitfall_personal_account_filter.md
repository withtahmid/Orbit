---
name: Personal twin account_id filter pitfall
description: Every personal/*.mts SQL that filters envelop_allocations by account_id silently returns 0 after the envelope-as-intent redesign.
type: project
---

After the envelope-as-intent redesign, `envelop_allocations.account_id` is always `NULL` for new flows. Both `createAllocation.mts` and `borrowFromNextMonth.mts` write `account_id: null`.

**Why:** Envelopes are now space-wide planning units, no longer per-account partitions.

**How to apply:** When reviewing any `personal/*.mts` (or `analytics/accountAllocation.mts`) query, search for `a.account_id = ANY` / `a.account_id = ${...}` filters on `envelop_allocations`. After this redesign such filters silently return 0 rows for new-style allocations. Either:
- Drop the account filter entirely (envelope is space-wide).
- Apply the filter only to legacy rows (`a.account_id IS NOT NULL`) and keep null rows in the sum.

**Files known to have this pattern as of 2026-05-10 idempotancy branch:**
- apps/server/src/procedures/personal/summary.mts (lines 140, 169, 191)
- apps/server/src/procedures/personal/envelopeUtilization.mts (lines 94, 104, 112, 154, 187, 241, 288)
- apps/server/src/procedures/personal/accountAllocation.mts (lines 77, 142, 175)
- apps/server/src/procedures/analytics/accountAllocation.mts (lines 101, 142, 175)

Personal queries that ALSO filter expense by `t.source_account_id = ANY(owned)` are correct (transactions still have a real source account); the bug is specifically the allocation-row filter.
