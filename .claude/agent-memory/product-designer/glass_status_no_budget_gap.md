---
name: glass-status-no-budget-gap
description: EnvelopeGlass glassStatus() returns "over" for total<=0; page-level over-guards mask it only by accident
metadata:
  type: project
---

`glassStatus()` in `apps/web/src/components/budget-gauge/status.ts` returns `"over"` whenever `current > total` in the spend branch, with NO `total <= 0` guard. The page-level `over` flag (BudgetDetailPage) and EnvelopeGlass's own `over` const both correctly require `total > 0`, so the red deficit doesn't paint — but the glass still calls `glassStatus()` for LIQUID COLOR, which resolves to `--expense` (red) for a no-budget envelope. It only reads neutral today because `hasLiquid` is false at 0 remaining.

**Why:** The "neutral glass for no-budget spend" fix (2026-07) hardened the two `over` booleans but not the shared `glassStatus` classifier beneath them.

**How to apply:** When reviewing budget-gauge work, treat `glassStatus` as the source of truth for status-keyed visuals. Any new status-tinted chrome (edge glow, empty-state tint) will resurface the red no-budget bug. The clean fix is `if (p.total <= 0) return "calm"` in the spend branch. Also: `glassStatus` defines a `"complete"` state for fully-funded goals that NO consumer renders — the goal glass looks identical at 96% and 100%; only copy marks completion.
