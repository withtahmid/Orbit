---
name: glass-status-boundaries
description: glassStatus() spend/save boundary rules — save uses >= at target ("complete"), spend total<=0 => "calm", exactly-at-budget => "warning" not "over"
metadata:
  type: project
---

`apps/web/src/components/budget-gauge/status.ts` `glassStatus()` after the envelope-detail redesign:

- SAVE: `total>0 && current>=target ? "complete" : "saving"`. The `>=` (was `>`) makes hitting the target EXACTLY read as complete — consistent with BudgetDetailPage `reached = saved>=target`, the status pill `goalSaved>=goalTarget`, and the glass fill/badge. Before the change status.ts alone disagreed at the exact-target boundary.
- SPEND: `total<=0 -> "calm"` (early return; no/zero budget is neutral, never over); then `current>total -> "over"` (strict); else `current/total >= warnAt -> "warning" : "calm"` (warnAt default 0.8, inclusive).
- Exactly-at-budget (`current===total`, e.g. 100/100): NOT "over" (strict `>`), lands in "warning" (ratio 1 >= 0.8). Correct and consistent with the page's `over = consumed > total` (also strict) and the glass deficit gate `over = total>0 && current>total`.

The old `safe = total>0?total:1` divide-guard was removed and is provably safe: the `total<=0` early return guarantees `total>0` before the `current/total` division — no NaN/Infinity.

**Why:** these are boundary-correctness invariants that must stay in lockstep across status.ts, BudgetDetailPage `over`/`status`, and EnvelopeGlass — a divergence would color a healthy envelope red/amber or vice versa.
**How to apply:** If any of the three sites changes its budget/target comparison operator (`>` vs `>=`) or its zero-budget handling, re-check all three agree. Don't "restore" the divide-by-zero guard — it's dead code now.
