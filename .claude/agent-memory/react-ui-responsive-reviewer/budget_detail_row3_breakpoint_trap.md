---
name: budget-detail-row3-breakpoint-trap
description: BudgetDetailPage .ed-row3 flex-wraps by container width but its stack media-query keys off viewport — mismatch breaks 961-1279px
type: project
---

`.ed-row3` in `apps/web/src/pages/space/budgets/BudgetDetailPage.tsx` (ED_STYLES, ~line 1940) lays out 3 analytics columns as `display:flex; flex-wrap:wrap` with children `flex:1 1 320px` (monthly), `flex:0 1 240px` (donut), `flex:1 1 320px` (velocity), plus two `.ed-row3-divider` (1px, `align-self:stretch`) rendered as siblings between columns in JSX (~line 1230).

The stacking media query is `@media (max-width:960px){ .ed-row3{flex-direction:column} }` — it keys off the **viewport**, but flex-wrap keys off the **container**. The 3 columns need ~930px of inline space (880 basis + 48 gaps + 2 dividers). With the SpaceLayout 232px sidebar (≥768px) and ed-scroll/card padding, the card inner only reaches 930px at ~1280px viewport.

**Result:** viewports **961-1279px** (incl. 1024, 1152, 1200) render a broken 2+1 wrap while the media query has NOT stacked them — and the vertical `.ed-row3-divider`s orphan (a full-height 1px line lands at the wrapped row's left edge).

**Why:** classic flex-wrap-vs-media-query mismatch; the "960px" number was picked as if the card == viewport, ignoring the sidebar + paddings.
**How to apply:** when reviewing container-context layouts here, verify the breakpoint math against the REAL card inner width (viewport − 232 sidebar − 64 scroll pad − 44 card pad), not the viewport. Prefer `@container` queries or bumping the stack breakpoint to ~1280px, or dropping flex-basis so wrap and media query agree. Dividers-as-siblings always orphan on wrap; a CSS gap-with-divider or `:not(:last)` border is safer.
