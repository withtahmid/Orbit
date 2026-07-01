---
name: spaceSummary envelope window (fixed on budget-bug-fix-2)
description: spaceSummary monthly held/consumed now honors input.periodStart/End (was hardcoded DATE_TRUNC month NOW); consumed filter uses ::date boundaries vs envelopeUtilization raw timestamps
metadata:
  type: project
---

`analytics.spaceSummary` takes `periodStart`/`periodEnd` (both `z.coerce.date()`). Originally the envelope block hardcoded the monthly window to `DATE_TRUNC('month', NOW())`, ignoring the input. Branch `budget-bug-fix-2` (2026-07) changed the monthly `p_start`/`p_end` to `${input.periodStart}::date` / `${input.periodEnd}::date` (rolling/goal still 1970..9999). Now allocating to the viewed month moves held/unallocated for that month.

**Consistency with envelopeUtilization (both fed the SAME periodStart/periodEnd from BudgetsPage/BudgetMonthPage via startOfMonth/endOfMonth):**
- ALLOCATED filter: both compare `a.period_start` (a DATE col, month-aligned) against the window cast `::date`. Identical. Correct.
- CONSUMED filter: DIVERGENCE IN FORM. `envelopeUtilization` compares `t.transaction_datetime >= ${periodStart} AND < ${periodEnd}` (raw timestamptz binds). `spaceSummary` compares `t.transaction_datetime >= p.p_start AND < p.p_end` where p_start/p_end are `::date`-CAST. These coincide ONLY because the web always sends month-aligned Dhaka-midnight boundaries: `startOfMonth`/`endOfMonth` return the APP_TZ month-start instant (…T18:00Z), and casting that to `date` under the Asia/Dhaka session yields the SAME calendar day; comparing a timestamptz to a date promotes date→00:00 Dhaka = the same instant. So results match numerically.
- **LATENT (not live):** if a NON-midnight `periodEnd` were ever passed to spaceSummary, `::date` truncates its time-of-day and would include/exclude a whole day differently from envelopeUtilization. No caller does this. Flag if a caller sends an arbitrary window.

**resolveSpaceUnallocated** stays pinned to `DATE_TRUNC('month', NOW())`. It has NO live callers (transfer guard path). The "same held" invariant in CLAUDE.md now has no runtime consumer; agreement holds only when viewed window IS current month. If a caller re-couples it, re-check.

`personal/summary` envelope window: check separately — was also hardcoded-now; not touched in this diff.

Related: [[migration-049-period-start-tz-fix]], [[apptz-month-helpers]], [[simplified-budgeting-model]].
