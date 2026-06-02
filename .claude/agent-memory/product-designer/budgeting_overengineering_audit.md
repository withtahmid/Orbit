---
name: budgeting-overengineering-audit
description: 2026-06-02 audit — budgeting model is overengineered (cadence×carry_policy×target×borrow×reckon×strict-mode); user wants simplification. Two divergent unbudgeted formulas; reset-at-month-start drops remaining to 0 by design.
metadata:
  type: project
---

Product owner's verdict (2026-06-02): "we have heavily overengineered the budgeting thing. need to simplify it to be useful, intuitive and practical." Audit of "pp's family" space at month start, no allocation yet.

**Why:** The concept surface has accreted across migrations 023-037 (cadence, carry_over boolean, carry_policy 3-value, target_amount/date goals, borrow-from-next-month, reckoning acks, strict budget_mode). Each shipped solo; together they overwhelm a family-budgeting user.

**How to apply:** When touching budgeting, prefer collapsing concepts over adding. The recommended direction (this audit): keep Envelope + monthly/rolling + optional target(goal); REMOVE the user-facing 3-way carry_policy (reset/positive_only/honest) — default monthly to surplus-carry, drop "both"/"reset" pickers; auto-allocate is the bigger fix (see below).

**Verified current numbers logic:**
- `unallocated = spendableBalance − envelopeRemaining` (spaceSummary.mts:305) and `unbudgeted = spendable − envelopeHeld` (resolveSpaceUnallocated.mts:154). BOTH clamp per-envelope held to GREATEST(0, ...), so an envelope's *negative* contribution never raises unbudgeted.
- That clamp is WHY unbudgeted stays 4954.50 whether "Living Expense" is rolling(2414.15) or reset(0): a reset monthly envelope at month start (no current-month allocation) has held=0 either way once you account for the formula. The rolling-vs-reset toggle changes the *envelope card's* remaining but the held that feeds unbudgeted is computed independently and clamped — they don't reconcile to a single identity the user can follow.
- Reset → remaining 0 at month start is BY DESIGN: a `reset`/cadence=monthly envelope only counts allocations whose period_start is the current month; at month start with no allocation, allocated=0, carryIn=0 → remaining=0. Intuitive only if the user knows allocation must happen each month.

**The real root cause:** allocation is a manual monthly step. `createEnvelopAllocation` requires the user to push money into each envelope every month (createAllocation.mts). At month start nothing is allocated, so monthly envelopes read 0 and everything piles into Unbudgeted. The fix the user actually needs is auto/recurring allocation (a per-envelope monthly budget amount that auto-fills), not more carry modes.

**Two unbudgeted code paths that can disagree:** spaceSummary.mts (uses periodStart/periodEnd overlay + one-sided MAX for rolling) vs resolveSpaceUnallocated.mts (NOW-based, no overlay). spaceSummary is what the budgets banner reads. resolveSpaceUnallocated is used elsewhere (allocation flows). Drift risk — see [[anomaly_pattern_sign_conventions]] cousin: two readers of the same quantity.
