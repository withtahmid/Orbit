---
name: niceticks-small-ymax-explosion
description: BudgetDetailPage niceTicks() loops thousands of times when yMax < 1 (goal target < 1 unit)
metadata:
  type: project
---

`niceTicks(yMax)` in `apps/web/src/pages/space/budgets/BudgetDetailPage.tsx` can emit thousands of ticks / near-freeze.

**Why:** `niceStep(yMax/4)` returns a fractional step for small yMax (e.g. yMax=0.001 → step ~0.0004), and the loop `for(v=0; v<=yMax+1; v+=step) ticks.push(Math.round(v))` runs `(yMax+1)/step` iterations. `Math.round` collapses them all to 0/1 (duplicate integer ticks) but does NOT bound the count: yMax=0.001 → ~2000 iters, yMax=0.0001 → ~20000, each producing an SVG gridline+label. Reachable via a goal with a sub-1 target amount. `niceStep(0)` also returns 0 (log10(0)=-Inf) which would infinite-loop, but that path is guarded by the `yMax<=0` early return + `|| 1` fallback.

**How to apply:** When reviewing tick generators, check the loop is bounded by tick COUNT (e.g. cap at ~10), not by a fractional step; and that Math.round isn't masking degenerate step sizes. Fix: derive a target count first, clamp step so tick count stays small.
