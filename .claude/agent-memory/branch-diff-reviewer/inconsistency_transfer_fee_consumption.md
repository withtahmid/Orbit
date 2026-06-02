---
name: Transfer-fee consumption inconsistency
description: Some envelope-consumption SQL counts transfer fees as consumption, others don't. Look for divergence on every review.
type: project
---

Transfer transactions optionally have `fee_amount` and `fee_expense_category_id`. The fee is supposed to consume the envelope its category rolls up to.

**Inconsistent treatment as of 2026-05-10 idempotancy branch:**
- INCLUDES fees as consumption: analytics/envelopeUtilization.mts, analytics/accountAllocation.mts, personal/envelopeUtilization.mts, personal/accountAllocation.mts.
- EXCLUDES fees as consumption: envelop/utils/resolveEnvelopePeriodBalance.mts (canonical helper for createAllocation deallocate-guards), allocation/utils/resolveSpaceUnallocated.mts (Overview "unallocated"), reckoning/listPending.mts, space/utils/resolveStrictGate.mts.

**Why this matters:** Two views of the same envelope's "remaining" disagree. The Overview "unallocated" overstates available cash; the deallocate guard lets users pull funds that have actually been consumed by fees.

**How to apply:** When reviewing any new query that sums `consumed` for envelopes, check whether it should include the fee UNION ALL block (look at envelopeUtilization.mts:144-166 for the canonical pattern) and flag the divergence.
