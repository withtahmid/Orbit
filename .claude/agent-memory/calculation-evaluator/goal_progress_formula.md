---
name: goal-progress-formula
description: "Goal `pctSaved` is `lifetime_funded / target` (sum of positive-amount allocations only). Spending from a goal no longer reverses progress. `pctComplete` remains as an alias of `pctSaved`."
metadata:
  type: project
---

**Current shape (branch `rename-plan-goal`, May 2026):**

`envelopeUtilization` (analytics + personal twin) exposes two related fields for
goal envelopes (`cadence='none'`, non-null `target_amount`):

- `lifetimeFunded` — `SUM(amount) FILTER (amount > 0)` on `envelop_allocations`
  for the envelope. Excludes deallocations / withdrawals.
- `pctSaved` — `clamp(0, 100, lifetimeFunded / targetAmount * 100)`.
- `pctComplete` — legacy alias that points at the same `pctSaved` value.

Personal twin scopes the same SQL with
`AND (a.account_id IS NULL OR a.account_id = ANY(ownedParam))`. Space-wide
allocations have `account_id IS NULL` so they fully count toward every member's
personal slice (NOT split). That is deliberate per the codebase's "space-wide
allocation" model but means two users contributing to a shared goal each see the
full pool as theirs.

**Borrow / cover / reckon / restructure interaction (migration 045 ledger):**

- `borrow` rows are only created by `procedures/envelop/borrowFromNextMonth.mts`
  and that path rejects any envelope with `cadence !== 'monthly'`. So
  `kind='borrow'` rows cannot land on goal envelopes today.
- `cover` / `reckon` / `restructure` have no writers yet. Once they do, the
  positive-only filter on `lifetime_funded` could over-count (e.g., a `cover`
  receiving leg that wasn't "user contributions toward goal"). Add a
  `kind IN ('allocate', 'borrow')` filter when those writers land.

**Display semantics:**

- BudgetsPage/EnvelopeCard shows `goalSaved = lifetimeFunded` raw, even if it
  exceeds target — only the progress bar clamps. Over-funding produces "$3200
  saved of $3000" with "100% complete" — acceptable but a "Over by $200" hint
  is the natural next addition.
- BudgetDetailPage progress bar still reads `envelope.pctComplete / 100`
  (== `pctSaved / 100`). Consistent.

**How to apply:**

- Treat `pctComplete` as deprecated alias; new readers use `pctSaved`.
- Don't reintroduce the old `remaining / target` formula — that was the
  withdrawal-sensitive bug.
- If product asks "should deallocations subtract from progress?", the answer
  changes the SQL from `amount > 0` to dropping the filter; flag the call.

Related: [[envelope-total]] (denominator question for non-goal envelopes).
