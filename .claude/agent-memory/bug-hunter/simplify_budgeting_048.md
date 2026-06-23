---
name: simplify-budgeting-048
description: Invariants + verified-clean classes for the migration 048 simplified-budgeting model (one row per envelope/period)
metadata:
  type: project
---

Migration 048 collapsed `envelop_allocations` to ONE absolute row per (envelope, period): monthly → row per APP_TZ (Asia/Dhaka) month (`period_start`=month-start date); rolling/goal (`cadence='none'`) → one lifetime row (`period_start IS NULL`). Unique index `(envelop_id, period_start) NULLS NOT DISTINCT`. Dropped: account_id/kind/effective_at/borrowed_link_id (allocations), carry_over/carry_policy (envelops), budget_mode (spaces), reckoning_acknowledgments table + reckoning/borrow/matrix/accountAllocation/envelopeHistory procedures+routes.

**Why:** Bug-hunt context for the `simplify-budgeting` branch.

**How to apply — classes verified CLEAN (don't re-flag without new evidence):**
- Dangling-trigger risk: migration 026 dropped the `envelop_balances` table AND its `__trigger_sync_envelop_balance_from_allocations` trigger. Allocation upserts do NOT hit a dangling trigger.
- Transaction edit/delete needs NO allocation write — `consumed` is derived on-read from `transactions`; editing/deleting an expense auto-updates balances.
- Allocate/deallocate/transfer all lock the envelope row(s) `FOR UPDATE` before read-modify-write upsert (transfer sorts the pair to avoid deadlock). Source available-check uses `remaining` so an empty envelope can't be pulled negative.
- Envelope delete cascades allocations (`envelop_id` FK onDelete cascade). No orphans.
- `unbudgetedTrend` (analytics + personal) `${windowStart}::timestamp` casts timestamptz→timestamp in SESSION TZ (Asia/Dhaka), so `m_start::date` aligns with stored APP_TZ `period_start`. NOT a tz bug.
- `spaceSummary`/`resolveSpaceUnallocated` deliberately use `DATE_TRUNC('month', NOW())` (current month) and IGNORE the `periodStart` input for envelope-held; BudgetMonthPage only reads `unallocated`/`spendableBalance` inside `isCurrentMonth`, so the stale-period summary is never shown for past/future months.
- target-only-on-cadence='none' invariant enforced at API boundary in both create.mts and update.mts (update wipes target cols on any move away from 'none').
- No `sql.raw` injection vectors in changed code (only seed.mts TRUNCATE over a hardcoded table list).
- All web readers of removed fields (carryIn/borrowedIn/breakdown/budgetMode) cleaned; both apps tsc-clean.
