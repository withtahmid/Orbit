---
name: envelope-recent-averages-month-offset
description: "RESOLVED on branch envelop-details-fix: envelopeRecentAverages.mts month-offset + cadence bugs fixed by moving month math into SQL bounds CTE with ::timestamptz::date and direct period_start = last_month_start compare. Historical detail below."
metadata:
  type: project
---

RESOLVED (branch `envelop-details-fix`, verified 2026-07-02). Both bugs below are
fixed. The fix moves all month arithmetic into a SQL `bounds` CTE:
`date_trunc('month', ${ref}::timestamptz)::date` and offsets by interval. Crucially
it casts `::timestamptz` FIRST (not straight `::date`) — a bare `$1::date` on a
bound param does a TEXT→date parse that keeps only the literal date substring and
drops the offset, reintroducing the exact one-month drift (see
[[period-start-date-cast-footgun]]). last_month_planned now uses
`a.period_start = b.last_month_start` (no COALESCE(created_at) fallback), so NULL-
period rolling/goal rows fall out via SQL null semantics. cumulativeSpend.mts got
the same `${input.periodStart}::timestamptz::date` fix on `is_current`. Personal
twins mirror both. Original bug writeup retained below for context.

---

`apps/server/src/procedures/analytics/envelopeRecentAverages.mts` HAD a CONFIRMED
month-offset bug (BudgetDetailPage "Last month" / "3-month avg" KPI tiles).

**The bug.** It re-derives the reference month with native `ref.getUTCMonth()`:
```
const refUtc = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
```
`ref` = frontend `periodStart` = `startOfMonth(viewingDate)`, an APP_TZ (Asia/Dhaka,
UTC+6) month-start. As an absolute instant, "00:00 on the 1st of month M, Dhaka" =
"18:00 on the LAST DAY of month M-1, UTC". So `getUTCMonth()` reads back **M-1**.

Worked example (viewing July 2026): periodStart = `2026-06-30T18:00:00Z`.
`getUTCMonth()` → 5 (June). refUtc = `2026-06-01`. lastMonthStart = `2026-05-01`,
threeMonthsAgo = `2026-03-01`. So "Last month" queries `[2026-05-01, 2026-06-01)` =
**May** (two months before the viewed July), and "3-month avg" = Mar/Apr/May.
This fires on EVERY load (constant +6h offset, no DST) — not a boundary edge case.

**Why the sibling procedure is fine.** `envelopeUtilization.mts` passes `periodStart`
straight into SQL as `${periodStart}::date`. The PG session runs in Asia/Dhaka
(see analytics/CLAUDE.md + db/index.mts), so the `::date` cast of that same instant
yields `2026-07-01` correctly. The bug is specifically re-deriving calendar fields
in JS with native UTC getters instead of letting SQL cast the instant. Same class as
[[apptz-month-helpers]].

**Fix.** Do the month arithmetic in SQL from the passed instant (cast to ::date in
the Dhaka session), OR bind `lastMonthStart`/`refUtc`/`threeMonthsAgo` as computed
`::date` params derived from `${ref}::date` in SQL rather than JS. Simplest: pass
`ref` through and compute `date_trunc('month', ${ref}::date)` server-side.

**Second, independent bug: no cadence filter.** `cadence='none'` covers BOTH goals
(target>0) AND plain rolling envelopes (no target). Frontend gates the query
`enabled: !isGoal` where `isGoal = targetAmount>0` — so it STILL runs for rolling
envelopes (seed has many: fam_gifts, per_reading, tr_flights, biz_travel, ...).
For those, the single allocation row has `period_start IS NULL`, so
`COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date) = lastMonthStart`
matches the pool's CREATION month by accident (or 0 otherwise) — a lifetime pool is
not a "last month's plan". analytics/CLAUDE.md warns: rolling/goal must match
`period_start IS NULL`, never a date compare. Fix: filter `e.cadence='monthly'` (or
`AND a.period_start IS NOT NULL`) in the last_month_planned subquery. last_month_spend
is a plain transaction-date window so it's semantically OK for rolling (just also
shifted by the month-offset bug above).
