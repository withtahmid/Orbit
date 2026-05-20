---
name: goal-progress-formula
description: "Goal `pctSaved` is symmetric `SUM(amount) / target` (signed, no positivity filter) over `kind IN ('allocate','borrow')`. Deallocations and outbound envelope-to-envelope transfers reduce progress. `pctComplete` is a legacy alias."
metadata:
  type: project
---

**Current shape (branch `rename-plan-goal`, May 2026 — symmetric model):**

`envelopeUtilization` (analytics + personal twin) exposes two related fields for
goal envelopes (`cadence='none'`, non-null `target_amount`):

- `lifetimeFunded` — `SUM(a.amount)` over `envelop_allocations`
  WHERE `a.envelop_id = e.id AND a.kind IN ('allocate', 'borrow')`. **No
  positivity filter** — deallocations and the negative leg of an
  envelope-to-envelope transfer both reduce it. Spending lives in the
  `transactions` table and never touches this sum.
- `pctSaved` — `clamp(0, 100, lifetimeFunded / targetAmount * 100)`. Server-side
  clamp guarantees the UI bar can't go negative or exceed 100% even though raw
  `lifetimeFunded` can.
- `pctComplete` — legacy alias of `pctSaved`.

Personal twin scopes with
`AND (a.account_id IS NULL OR a.account_id = ANY(ownedParam))` — the space-wide
(`account_id IS NULL`) rows count fully toward each member's personal slice.

**Conservation property (verified):**

Transfer from Goal A → Goal B emits two `kind='allocate'` rows (`-X` on A, `+X`
on B). Both pass the kind filter, so SUM_A drops by X and SUM_B rises by X. The
total `lifetimeFunded` across all envelopes nets to zero change. Confirmed
correct.

**Borrow row pairing — same envelope (verified):**

`procedures/envelop/borrowFromNextMonth.mts` writes both legs of a borrow with
the SAME `envelop_id` (lines 99 and 118; only `period_start` and sign differ).
So `SUM(amount) WHERE kind='borrow'` per envelope = 0 across a fully-resolved
borrow cycle. The pair does NOT live on different envelopes, so the symmetric
formula does not accidentally cancel goal funding via borrow.

Today `borrow` rows can't land on goals at all because
`borrowFromNextMonth.mts` rejects `cadence !== 'monthly'` and goals are
`cadence='none'`. The kind filter still matters for future writers.

**UI consumer audit (verified clamp):**

- `BudgetsPage.tsx:775-778` and `968-972` — `Math.max(0, Math.min(1, goalSaved / targetAmount))`. Clamp present, safe.
- `BudgetDetailPage.tsx:430` — `envelope.pctComplete / 100` (already clamped server-side). Safe.
- `OverviewPage.tsx:1070-1071` — `pctRaw / 100` (server-clamped). Safe.

**Cosmetic edge cases (not bugs, but worth knowing):**

- `BudgetDetailPage.tsx:419` displays `lifetimeFunded.toFixed(2)` raw. If net
  funding goes negative, UI shows "-150.00 / 5000.00".
- `OverviewPage.tsx:1022` rollup `totalSaved` is an unclamped reduce over
  `lifetimeFunded`; can also display negative.
- `envelopeUtilization.mts:432-433` STILL CARRIES THE STALE COMMENT
  "Spending money out of the goal does not reverse progress — completing
  a goal stays completed." That was true under the old positive-only
  formula; under symmetric it's wrong. Update if you touch this file.

**How to apply:**

- Treat `pctComplete` as deprecated alias; new readers use `pctSaved`.
- Don't reintroduce the `amount > 0` filter on `lifetime_funded` — the
  symmetric model is the explicit product choice.
- When the `cover` / `reckon` / `restructure` writers land, decide
  per-kind whether they belong in the lifetime sum. Today only
  `allocate` + `borrow` count.

Related: [[envelope-total]] (denominator question for non-goal envelopes),
[[envelope-ledger-kinds]] (kind filter rule).
