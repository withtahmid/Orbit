---
name: month-stepper-addmonths-overflow
description: addMonths(now, offset) overflows on days 29-31 and skips/repeats months; anchor to startOfMonth first
metadata:
  type: project
---

Month-stepper UIs that compute `viewingDate = addMonths(now, monthOffset)` are BUGGY on the 29th-31st.

**Why:** `apps/web/src/lib/dates.ts` `addMonths` preserves day-of-month via UTC `getUTCMonth()+months` arithmetic, which OVERFLOWS when the target month is shorter. From `now = July 31`, stepping back yields wall-clock: Jul(0), Jul(-1), May(-2), May(-3), Mar(-4), Mar(-5)... → June/April/Feb are SKIPPED and Jul/May/Mar each appear twice. `startOfMonth(viewingDate)` then keys the queries to the wrong month; the label lies too. Verified by simulation 2026-07-01.

**How to apply:** Any month browser must anchor to a month-start BEFORE stepping: `addMonths(startOfMonth(now), monthOffset)` (or use `addMonthsClamped`). `BudgetMonthPage.tsx` does it right — it steps from `monthDate` which is already a month-start. `BudgetDetailPage.tsx` (envelop-details-update branch) does it WRONG — steps from raw `now`. Latent when today's day-of-month <= 28.

Related: niceTicks in the same file [[niceticks-small-ymax-explosion]] loops thousands of times for sub-1 yMax because of an in-loop Math.round on a fractional step.
