---
name: simplified-budgeting-model
description: Migration 048 collapsed envelop_allocations to one row per (envelope, period); how monthly vs rolling/goal allocations, held, and pctSaved are computed under the new model
metadata:
  type: project
---

Migration `048_simplify_budgeting` collapsed `envelop_allocations` to **one row per (envelope, period)**, unique index `(envelop_id, period_start) NULLS NOT DISTINCT`. No more kind/effective_at/borrowed_link_id/account_id; no carry_policy/carry_over; no budget_mode; reckoning table dropped.

**Why:** deliberate simplification — abandoned the typed-ledger direction. Overspend is shown, never blocked.

**How to apply when auditing envelope math:**
- Monthly (`cadence='monthly'`): one row per APP_TZ (Asia/Dhaka) month-start date; `amount` = absolute total. RESETS each period (no carry). Match by `period_start = month::date` OR a single-month date range — both equivalent since exactly one row per month.
- Rolling/goal (`cadence='none'`): exactly ONE lifetime row, `period_start IS NULL`. MUST match `IS NULL`, never a date range (range drops the NULL row).
- **Held** = `GREATEST(0, allocated − consumed)` clamped PER ENVELOPE, then summed. Feeds `unallocated = spendable − Σheld`. Clamp must be per-envelope, never after the sum.
- `spaceSummary.mts` and `resolveSpaceUnallocated.mts` must produce the same held → same `unallocated`. They currently agree (same WITH period / GREATEST-per-env / spendable formula).
- **pctSaved** (goal progress) = `lifetime_funded / target_amount * 100`, clamped [0,100]. `lifetime_funded` = SUM of all allocation rows (positive allocations only in practice); spending in `transactions` never reduces it, so completed goals stay completed. Guarded by `targetAmount > 0` → no div-by-zero (returns null).
- PG session is Asia/Dhaka, so SQL `DATE_TRUNC('month', NOW())::date` aligns with JS `periodWindow.mts` boundaries and seed `startOfMonthUTC` (UTC midnight on 1st = 06:00 Dhaka, same calendar date for a `date` column).

**Known cross-reader inconsistency (intentional, documented):** `unbudgetedTrend.absorbedOverspend` iterates WHOLE calendar months via generate_series and only counts months whose end `<= now`. This can include a calendar month that started before `windowStart` (it counts the full month's overspend, not just the slice after windowStart). The income/allocChange components use the precise `[windowStart, now)` cutoff. The procedure's own docstring says the components don't have to reconcile exactly. Treat as acceptable approximation unless product wants exact-window absorbed.
