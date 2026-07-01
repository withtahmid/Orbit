---
name: unbudgeted-allocation-window-bug
description: Why "allocating money doesn't reduce Unbudgeted" — spaceSummary held is hardcoded to current calendar month, so allocations to future/next months (which the redesigned BudgetMonthPage encourages) never move unallocated.
metadata:
  type: project
---

Reported bug: "Allocating to an envelope doesn't decrease the Unbudgeted figure."

**Root cause is a WINDOW MISMATCH, not a missing subtraction or bad sign.** The
`unallocated` math itself is correct (`spendable − Σ GREATEST(0, alloc−consumed)`),
and for a monthly envelope funded in the *real current* calendar month it DOES
drop Unbudgeted. The failure surfaces because the two data sources use different
periods:

- `analytics.envelopeUtilization` honors its `[periodStart,periodEnd)` input
  (envelopeUtilization.mts L101-102, L115-116). BudgetMonthPage / BudgetsPage
  pass the *viewed* month.
- `analytics.spaceSummary` **ignores** its `periodStart/periodEnd` for the
  envelope/held block — hardcodes `DATE_TRUNC('month', NOW())::date`
  (spaceSummary.mts L97, L101, L128-129). Same hardcode in
  `resolveSpaceUnallocated.mts` L47/L51/L75. So `unallocated` is ALWAYS
  "held as of the real current calendar month."

Therefore any allocation that lands in a period other than the live calendar
month writes a real `envelop_allocations` row but never moves `unallocated`:
1. **Allocate → next month** in EnvelopeAllocateDialog (`periodChoice='next'`).
2. **Save budget for a future month** in BudgetMonthPage (periodStart = that
   month). The redesign (commit a46f59ed) actively encourages "Budget August".
3. Editing a **past** month.

Two legitimate no-move cases also read as this bug (documented, NOT fixes):
covering an already-overspent envelope (clamp), and rolling/goal envelopes that
are net-overspent lifetime.

**The fix** = make spaceSummary's envelope/held block honor the same window
`envelopeUtilization` uses (thread `periodStart/periodEnd` into the `period` CTE
instead of `DATE_TRUNC('month', NOW())`). rolling/goal stay `[epoch,∞)`.
`isOverAllocated` is derived from `unallocated` so it follows automatically. Note
`spendableBalance` is point-in-time (no window) — that's fine, it's current cash;
the mismatch is purely the envelope side. This supersedes the "window is always
now" note ([[spacesummary_window]]) which described the behavior as intentional;
once product wants allocation feedback to track the viewed month it is a bug.

See [[unbudgeted_cash_identity]], [[simplified_budgeting_model]].
