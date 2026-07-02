---
name: budget-detail-page-analytics
description: BudgetDetailPage.tsx analytics-row status — round-1 issues (footnote mismatch, hasData, monthOffset year-scope) FIXED and verified; remaining live issues = archived over-pace alarm regression, YTD-vs-full-year footnote asymmetry, personal-space UUID.
metadata:
  type: project
---

`apps/web/src/pages/space/budgets/BudgetDetailPage.tsx` — the "Monthly spend"
column (`EnvelopeMonthlyBars`) analytics row.

## Round-1 issues — FIXED and re-verified (2026-07-02)
- Footnote now branches on `isMonthlyCadence`: bullet mode shows "Spent X of Y
  allocated this year", rolling shows "this year vs last (so far)". No longer
  mismatched.
- `hasData = (monthly?.hasData ?? false) || hasAllocData` — allocations now keep
  the chart from hiding behind the empty state.
- `yoyQuery` gets `year: getAppTzYear(viewingDate)`; `allocQuery` gets
  `year: monthly?.year` (which echoes that input). Threads correctly; the
  cross-year transient is gated by `allocQuery.isLoading` (query-key change =
  fresh isLoading), so no wrong-year flash. monthOffset year-scope resolved.

## Round-2 issues — FIXED and re-verified (2026-07-02, round 3)

- **Archived over-pace alarm regression — FIXED.** `EnvelopeSpendChart` now takes
  `archived?: boolean` (default false); `alertColor` = `--fg-3` when archived,
  else two-tier (`--expense` if `isOverBudget = cur[today-1] > budget`, else
  `--warn`). All escalation paths (bracket L363, ping L403, dot L414, label L499)
  use `alertColor`. Page threads `archived` into `race` at BudgetDetailPage:635.
  Same two-tier severity mirrored in the hero "Pace today" KPI tile (`factColor`
  gained a `warn` case). Verified consistent.
  - NOTE (Low, pre-existing): the budget CEILING line (EnvelopeSpendChart:287) is
    still hardcoded `var(--expense, #ef4444)` and is NOT muted for archived. It's a
    static reference marker, not a state alarm, so arguably fine — but it's the one
    red thing left un-muted on an archived monthly envelope with a budget.

- **Footnote YTD-vs-full-year asymmetry — FIXED.** `monthly` useMemo now exposes
  `windowMonths` (= index of first null in raw `thisYear`, i.e. elapsed months, or
  12 for a completed past year). Footnote slices `allocatedArr` to `windowMonths`
  before summing (`ytdAllocated`) so it compares like-window against `ytdSpent`.
  `monthly.windowMonths` is guaranteed present because the footnote only renders
  under the `!monthly || !hasData ? empty : ...` gate — the `?? 12` fallback is
  defensive dead code. Verified.

- **Personal-space UUID (pre-existing, not this diff).** `/s/me/budgets/:envelopeId`
  renders BudgetDetailPage with `space.id === "me"`; every analytics query
  (`envelopeUtilization`, `envelopeRecentAverages`, `yearOverYear`, and now
  `envelopeMonthlyAllocations`) sends `spaceId:"me"` which fails server
  `z.string().uuid()`. BudgetsPage has the same pattern, so the whole budgets
  feature is presumably just not surfaced under `/s/me`. The NEW procedure has no
  `personal.*` twin, but neither does the page work in personal mode at all — so
  it's not a fresh regression. Verify whether personal nav ever links here.

**How to apply:** when reviewing this section, check footnote text + empty-state
gate branch on `bulletMode`/cadence the same way the chart body does, and check any
NEW alarm visual added to child charts is mutable for archived envelopes.
