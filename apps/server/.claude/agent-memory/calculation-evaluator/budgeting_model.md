---
name: budgeting-model
description: The simplified envelope budgeting model intent — allocation row shape, monthly reset semantics, rolling lifetime pool, held/unallocated formula.
metadata:
  type: project
---

Simplified budgeting model (branch simplify-budgeting, migration 048).

`envelop_allocations`: exactly ONE row per (envelope, period). Columns
account_id, kind, borrowed_link_id, effective_at were DROPPED.
- Monthly (`cadence='monthly'`): one row per calendar month, `period_start` =
  APP_TZ month-start `date`; `amount` is the ABSOLUTE allocated total (not a delta).
- Rolling/goal (`cadence='none'`): exactly one lifetime row, `period_start IS NULL`;
  `amount` is the absolute lifetime pool.

Semantics:
- Monthly resets every period, NO carry-over: `remaining = allocated(this month) − consumed(this month)`.
- Rolling/goal = lifetime pool: allocated = the NULL-period row; consumed = ALL expenses ever.
- Held (for unallocated cash) = per envelope `GREATEST(0, allocated − consumed)`, summed.
  Clamp is applied PER-ENVELOPE BEFORE summing — overspend must not inflate free cash.
- `unallocated = spendable − Σ held`.

**Why:** Replaces the old ledger/borrow/carry model. Rolling envelopes MUST match
`period_start IS NULL` (NOT a date-range comparison — that excludes the NULL row).

**How to apply:** When auditing balance/analytics math, confirm rolling reads use
`IS NULL` and monthly windows use a single-month predicate. spaceSummary,
resolveSpaceUnallocated, and personal/summary must produce the SAME held number.
