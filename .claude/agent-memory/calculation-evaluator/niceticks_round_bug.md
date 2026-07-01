---
name: niceticks-round-bug
description: BudgetDetailPage niceTicks() rounds tick values to integers, producing duplicate ticks/labels when yMax < ~8; harmless for real budgets
metadata:
  type: project
---

`niceTicks(yMax)` in `apps/web/src/pages/space/budgets/BudgetDetailPage.tsx` applies `Math.round(v)` to each tick value.

Fact: For yMax < ~8 the computed `step` is fractional (e.g. yMax=2 → step=0.5 → ticks 0,0.5,1,1.5,2 → rounded to [0,1,1,2,2]) giving duplicate integer tick labels and overlapping gridlines. For yMax ≥ ~40 step is already an integer so rounding is a no-op — which is why it passes on real budgets (hundreds+).

The `yMax <= 0` guard IS present and correctly prevents `Math.log10(0) = -Infinity` → infinite loop. Do not remove it.

**Why:** Money amounts in this app are BDT/USD in the hundreds+, so the bug is latent, not live.
**How to apply:** If asked to fix, drop the `Math.round` and let the caller's `fmtY` (compactMoney) format precision. Only worth doing if tiny-value goals become real. Not a correctness bug on current data.
