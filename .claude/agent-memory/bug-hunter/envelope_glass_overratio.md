---
name: envelope-glass-overratio
description: EnvelopeGlass spend gauge no-budget-but-spent state and slosh-animation review notes (budget-ui-update vertical-bottle rewrite).
metadata:
  type: project
---

`apps/web/src/components/budget-gauge/EnvelopeGlass.tsx`.

## No-budget-but-spent (FIXED as of budget-ui-update branch)
Prior regression (empty glass for allocated=0, consumed>0) is now FIXED:
`noBudgetSpent = variant==="spend" && total<=0 && current>0` forces `redFrac=1`,
and `over` is true (current>total when total=0), so the red hatched deficit fills
the whole interior. `liquidFrac=remainingFraction(consumed,0)=0` → no liquid. Full
red, consistent. Good.

## Vertical-bottle rewrite review (budget-ui-update, 2026-06-30)
Verified CLEAN:
- `--eg-dx` custom property is set on the SAME `<g>` that carries `animation:eg-slosh`,
  and the keyframe reads `var(--eg-dx,0px)` — resolves correctly. Level translateY
  (outer g) and slosh translateX (inner g) are on separate elements, compose fine.
- Reduced motion: `sloshStyle` returns `{}` → inner g has no transform → wave sits
  at static built position. Not broken.
- `useGlassStyles` dedupes by `document.getElementById(STYLE_ID)`; single shared
  `<style id="envelope-glass-styles">`. CSS is identical for all instances → no
  collision. The `--eg-dx` var is per-element, not global, so multiple cards don't
  clash.
- `useId()` per-instance for clip/sheen/hatch/glassGrad → no clip/gradient bleed
  across the many auto-fill cards.
- Division guards: remainingFraction returns 0 for budget<=0; deficitFraction
  returns 0 for r<=0; liquidFrac for save uses `total>0 ? current/total : 0`. No
  NaN/Infinity reachable.
- Removed classes (env-card-amt-row, env-card-of, env-card-overspend-note,
  env-list-row-bar) and removed JSX (drift span→low, overspend note, ProgressBar)
  left no dangling refs; ProgressBar fully deleted. `goalPct` still used in card
  foot (line ~907); `low`/`drift` defined where used. `isGoal` now `!=null && >0`
  consistently in card + list row + glass `total` prop.
- warnAt threshold consistent: card `low` uses `consumed/total>=0.8`; list row uses
  `glassStatus===warning` (warnAt 0.8 default); glass internal glassStatus same.

## OverRatio gauge model (rewritten, reviewed 2026-07-01) — CLEAN
The `ZOOM_H`/`deficitFraction` model was replaced. Verified consistent:
- `overRatio = (consumed-allocated)/allocated` only when `over && total>0` else 0.
- `redFrac = noBudgetSpent?1:clamp(overRatio,0,1)`; `zoom = overRatio>1`.
- `lineY = y1 - (overRatio>0 ? 1/overRatio : 0)*ih`; line only RENDERS under `{zoom}`
  so 1/r ∈ (0,1). No div-by-zero (overRatio>0 guard) / NaN / Infinity reachable.
- Boundary overRatio===1 (100% over): zoom=false (strict >), redFrac=1 → full red,
  NO 1× line; card readout "100% over budget". Self-consistent (deliberate: at exactly
  one budget over the glass is full and the line would coincide with the rim anyway).
- noBudgetSpent: over=true (current>total when total<=0), overRatio=0, redFrac=1 → full
  red no line; readout "spent · no budget". Consistent.
- Card readout `Math.round(((consumed-total)/total)*100)% over` == overRatio*100, matches gauge.

## Remaining low-severity notes
- Tiny overspend (e.g. consumed=100.4, total=100 → overRatio=0.004): readout rounds to
  "0% over budget" while glass shows a red sliver + red card border + AlertTriangle.
  Cosmetic only; the over-state is unambiguously flagged. Not a defect.
- BudgetsPage lean (removed List/Grouped/attention/priority): grep confirms EnvelopeListRow,
  buildAttention, groupEnvelopes, grouped3, view/setView, priorityQuery, ProgressBar,
  ViewMode/Group, ChevronRightIcon/FolderIcon/Grid3x3/ListIcon, spentFrac/pctSpent and all
  env-list-row/env-groups/env-attention/env-view-toggle/env-hero-grid CSS fully removed with
  no dangling refs (only 2 incidental mentions in prose comments). New env-summary/* classes
  all defined. HeroStat `size` prop used consistently (3× size={26} on the strip as of the
  2026-07-01 resize tweak; default 28). Check/formatInAppTz/EntityAvatar imports still used.
- `overBudgetLabel(consumed,total)` (BudgetsPage): only called under `drift && total>0`
  (consumed>total>0) so r>0 always — no div0/NaN. r<0.01→"<1%", r>=10→"N×", else "X%".
  Replaces the bare "over" card label; reviewed CLEAN 2026-07-01.
- Negative `lifetimeFunded`/`goalSaved` (shouldn't happen but type is number) would
  give liquidFrac clamp(neg,0,1)=0 — safe.
- `env.consumed` negative (a refund-heavy envelope) → drift false, remaining>total,
  remainingFraction clamps to 1 (full glass) and "% left" could exceed 100 → rounds
  to e.g. 120% left. Minor: only if consumed<0. Not introduced by this diff.
