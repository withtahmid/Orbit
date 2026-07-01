---
name: budget-gauge-geometry
description: "EnvelopeGlass fluid gauge math — FULLY CORRECT as of 2026-07-01 (overspend model rewritten). Deficit redFrac=clamp(r,0,1); 1x line at 1/r; goal caps at rim; % left foot now Math.min(100,..)-clamped. No bugs."
metadata:
  type: project
---

`apps/web/src/components/budget-gauge/EnvelopeGlass.tsx` + `status.ts` — fluid-glass
budget gauge that replaced the old ProgressBar on BudgetsPage (branch `budget-ui-update`).

**Geometry constants:** card IY1=208, IH=196, IY0=12 (viewBox 0 0 120 220); pot
Y1=56, H=48, Y0=8 (viewBox 0 0 48 64). `fluidTopY = y1 − frac*ih` (y grows down):
frac=1 → rim (card 12 / pot 8), frac=0 → floor (card 208 / pot 56). VERIFIED exact.
`ZOOM_H=0.28`, `BUDGET_LINE_FRAC = 1/(1+ZOOM_H) = 0.78125` (card lineY=54.875, pot
lineY=18.5).

**Spend path — CORRECT.** liquid=`remainingFraction(spent,budget)=clamp((b−s)/b,0,1)`
drains rim→floor over 0→100%.

**overspend model (re-verified 2026-07-01, envelop-details-update branch) — CORRECT.**
`over = variant==="spend" && total>0 && current>total` (NOTE: the old `noBudgetSpent→over`
path is REMOVED — unbudgeted spend total≤0 no longer triggers the red deficit; it now
reads as a neutral empty glass). `overRatio r=over&&total>0 ? (current−total)/total : 0`.
`redFrac=clamp(r,0,1)` (no more noBudgetSpent forcing) → 50% over (r=0.5) fills half; r≥1
fills full. `zoom = r>1` (strict). `lineY = IY1 − (1/r)·IH` (guarded r>0). Line
fraction-from-bottom = 1/r: r=2→0.5 (middle), r=3→0.333, r=4→0.25. r=1 boundary: strict `>`
means no degenerate line on the rim — correct. Removal of noBudgetSpent path did NOT break
genuine overspend (total>0 && current>total still renders deficit). No div-by-zero anywhere.

**Goal/save path — NOW CORRECT (the rescale bug I flagged earlier is FIXED).**
Line 166-169: liquid = `clamp(total>0 ? current/target : 0, 0, 1)`. Caps at rim, no
rescale, no "1× TARGET" line (zoom/line gated on `variant==='spend'` via `over`).
At 100% funded liquidFrac=1 (rim); at 130% still 1.0 — NO discontinuity, monotonic
up to the cap. The old deficitFraction-on-full-ratio jump is gone.

**glassStatus boundaries — CORRECT.** spend: <0.8 calm, ≥0.8 warning (inclusive),
exactly 100% still warning (over is strict `current>total`), >100% over. save: total>0
& current>total → complete, else saving.

**Slosh seamlessness — CORRECT.** buildBody sine period = `len`; translateX dx = −len
per layer, so the loop is seamless (sin is len-periodic). card front len40/dx−40,
back len52/dx−52; pot front len13/dx−13, back len17/dx−17 — all match. Path domain
x∈[−60,180] still covers the interior after the max −52/−17 shift.

**Aspect ratio — CORRECT (no distortion).** SVG viewBox fixed; width set, height set,
no preserveAspectRatio override so default `xMidYMid meet` letterboxes without
stretching. card 132px → width round(132*0.55)=73 (viewBox ratio 0.545, rendered box
0.553 — meet centers, no distortion). pot fixed 30×40 = 0.75 = viewBox 48/64. Fine.

**`% left` foot — NOW CORRECT (prior MINOR fixed).** BudgetsPage:718
`Math.min(100, Math.round((remaining/total)*100))` shown when `!drift && total>0`.
The `Math.min(100,..)` clamp resolves the old refund-overshoot (consumed<0 → >100%);
now caps at 100% to agree with the glass's full cap.

`goalSaved = lifetimeFunded` can be negative (see [[goal-progress-formula]]); the
`current/target` clamp floors it at 0 — safe.
