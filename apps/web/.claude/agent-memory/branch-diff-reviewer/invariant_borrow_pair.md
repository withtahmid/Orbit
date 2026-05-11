---
name: Borrow-pair invariant
description: borrowed_link_id groups two envelop_allocations rows: +X current period, -X next period. Both deleted atomically on undo.
type: project
---

Borrow-from-next-month creates two rows in `envelop_allocations` linked by a shared `borrowed_link_id` UUID:
- Current period: `+amount` row.
- Next period: `-amount` row.

Both rows live on UTC month boundaries (`Date.UTC(year, month, 1)` / `Date.UTC(year, month+1, 1)`).

**Procedures:**
- `envelop/borrowFromNextMonth.mts` — creates the pair atomically inside a tx. Owner/editor only. Monthly envelopes only.
- `envelop/undoBorrow.mts` — deletes both rows by `(envelop_id, borrowed_link_id)`. Owner/editor only.
- `envelop/listBorrows.mts` — groups by link_id, returns links where the −X half is current-month-or-future. Past borrows are filtered out (already realized).

**How to apply:** When reviewing analytics SQL:
- Borrow rows DO contribute to `allocated` SUM intentionally — +X is real funding, −X correctly reduces next-month plan.
- DO check that prev-period carry-in subqueries don't unintentionally subtract −X twice (the row already reduces prev_alloc; subtracting carry from "remaining" pre-clamps it again).
- DO check that `borrowed_in` / `borrowed_out` reportable signals are computed with the correct sign+period filter.

`listBorrows` walks rows and groups them as it goes — no validation that orphans exist. A partial-data state with one half deleted would surface as `currentPeriodStart=null` or `nextPeriodStart=null` on a borrow card.
