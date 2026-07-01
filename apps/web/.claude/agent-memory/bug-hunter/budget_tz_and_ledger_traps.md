---
name: budget-tz-and-ledger-traps
description: Two recurring bug classes in the simplified budgeting model — browser-local period math, and stale delta-ledger assumptions over the new absolute-amount rows.
metadata:
  type: project
---

Two recurring bug classes seen across the budgeting code (server + web). See also [[apptz_format_trap]].

**1. Browser-local period boundaries instead of APP_TZ.** Multiple call sites compute the
month window with `new Date(y, m, 1)`, `new Date(Date.UTC(y, m, 1))`, or native
`getFullYear()/getMonth()/getDate()` on an APP_TZ-derived Date. APP_TZ is Asia/Dhaka (UTC+6),
so near a month boundary the UTC/browser month differs from the Dhaka month the server uses
(`date_trunc('month', NOW())` in the Dhaka session). Symptom: allocation writes land in the
wrong month while the on-screen figures describe a different month; status cards query the
wrong window.
**Why:** server period math + PG session are Dhaka; any client-side month construction must
use `@/lib/dates` (`startOfMonth`, `endOfMonth`, `addMonths`, `makeAppTzDate`,
`getAppTzYear/Month/Date`).
**How to apply:** whenever you see a `Date` built or read with native getters for a *period
boundary* (not just display), flag it. Display also needs `formatInAppTz`, not `toLocaleString`.

**2. Stale delta-ledger semantics over the new absolute-amount rows.** Post-048,
`envelop_allocations` holds ONE row per (envelope, period) whose `amount` is the ABSOLUTE
accumulated total; allocate/deallocate is an accumulating UPSERT that does NOT change
`created_at`. Any query that sums `amount` filtered by a `created_at` window (e.g.
`unbudgetedTrend.allocationsNet`) is now wrong — it treats absolute totals as if they were
per-change deltas. The old append-only ledger made this correct; the collapse broke it.
**Why:** the metric assumed each row was a delta event; rows are now mutable running totals.
**How to apply:** be suspicious of any `SUM(envelop_allocations.amount) ... WHERE created_at`
or per-window allocation-change math; there is no per-change delta in the collapsed model.

**3. spaceSummary held window (RESOLVED on branch budget-bug-fix-2, 2026-07).** For a long
time `spaceSummary` (and `resolveSpaceUnallocated`) hardcoded the monthly-envelope held/consumed
window to `DATE_TRUNC('month', NOW())`, ignoring the procedure's `input.periodStart/End`. Symptom:
allocating to a non-current month never moved Unbudgeted; BudgetMonthPage mixed current-month
`unallocated` with a viewed-month `heldDelta`. Fix honors `${input.periodStart/End}::date` for
`cadence='monthly'` (rolling/goal still lifetime 1970..9999). Boundary is tz-safe: PG session is
Asia/Dhaka, `endOfMonth` returns the exclusive next-month-start absolute Date, and `::date` in the
Dhaka session yields the right calendar date, so `transaction_datetime < p_end` still includes the
full last day (same as the old expression). `resolveSpaceUnallocated` was left pinned to current
month but currently has NO live callers — the "same held number" invariant in analytics/CLAUDE.md
has no runtime consumer, so the divergence is harmless.
**How to apply:** if a future caller starts calling `resolveSpaceUnallocated` for a non-current
window, or re-couples it to spaceSummary, the pinned-NOW helper will disagree — re-check then.
