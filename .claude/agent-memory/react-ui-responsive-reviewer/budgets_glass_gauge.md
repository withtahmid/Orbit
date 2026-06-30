---
name: budgets-glass-gauge
description: Budgets page (BudgetsPage.tsx) + EnvelopeGlass gauge — post-restructure layout (summary strip, single grid view, bottle cards), token contrast traps, and orphaned-CSS watchlist.
metadata:
  type: project
---

`apps/web/src/components/budget-gauge/EnvelopeGlass.tsx` renders a budget envelope as an inline-SVG "glass of money". Two sizes: `card` (viewBox `0 0 120 220`, rendered `round(height*0.55) × height`; BudgetsPage passes height 132 → ~73×132) and `pot` (viewBox `0 0 48 64`, 30×40 — but the `pot` size is **no longer used** on BudgetsPage after the list/row removal). State via `glassStatus` in sibling `status.ts` (calm/warning/over/saving/complete). SVG `role="presentation"` (correct — meaning lives in the surrounding HTML + the card's `aria-label`). `eg-slosh` keyframe gated by JS `usePrefersReducedMotion` (no CSS-only bypass). The `zoom` "1× budget" line is `stroke=var(--fg)` opacity 0.95 (near-white dashed) over the red hatch — legible, reads as a reference mark not a glitch.

**BudgetsPage.tsx structure (post-restructure — grouped/list views, ProgressBar, attention card, priority bar, view-toggle ALL removed):**
- Topbar: month-pill eyebrow + `Budgets` h1 + SortPicker + New-envelope. Subtitle `<p class="env-sub">` REMOVED (but `.env-sub` CSS rule at ~L1615 is now ORPHANED — safe to delete).
- `.env-summary` (od-card, padding 16/18, flex column, gap 14): `.env-summary-main` (flex row, `align-items:center`, gap 28, wrap) = `.env-month-nav` (2 `.env-hero-arrow` btns + `.env-month-label` min-width:92px + `.env-month-days`) and `.env-summary-stats` (flex row, gap 20, wrap) holding 3 `HeroStat`s at size=19 separated by `.env-summary-divider` (1px, `align-self:stretch; min-height:28px`). Below `.env-summary-main`: `UnbudgetedBanner` (only when monthOffset===0). At ≤640px dividers `display:none`, gaps → 14.
- `.env-toolbar` `justify-content:space-between` but now has ONE child (`.env-search` max-width 360) → dead space on the right.
- Grid `.env-grid` = `repeat(auto-fill, minmax(196px,1fr))`, gap 14; ≤640px floor 150px. NO max column cap (intentional — ultrawide gets many columns).
- Card `.env-card` (od-card, padding 16, gap 12, flex column): head → `.env-card-glass-wrap` (centered glass h132) → `.env-card-hero.env-card-hero-center` (number+label stacked centered) → spend-only `.env-card-stats` (Spent/Allocated, each `.env-card-stat` `flex:1 1 0; min-width:0; overflow:hidden`, size 12) → `.env-card-foot` (`margin-top:auto`; "% left" for spend, goal copy for goals). `:focus-visible` ring added (2px brand). Overspent cards get `.env-card-over` red-tinted border. Goal cards skip the stats row → uneven heights, but `margin-top:auto` on foot bottom-aligns.
- Overspend hero label: `${pct}% over budget` uppercased + letter-spaced 11px, centered, with AlertTriangle icon. `.env-card-hero-label` is `inline-flex` NO `flex-wrap` — icon + text are 2 flex items; the text node wraps internally (multi-line OK at 150px). Paired with icon + word so not color-only.

**Token contrast traps (orbit-design dark theme, od-card surface = --bg-elev-1 L17%):**
- HeroStat VALUES at size 19: `--fg` (L96), `--brand` (L72), `--gold` (L82) — all pass 4.5:1 easily.
- HeroStat SUB + `% left` foot use `--fg-4` (oklch L48%) at 11–11.5px → ~3:1, BELOW 4.5:1 for small text. Pre-existing pattern (was --fg-4 before too). Minor/known.
- `--warn` (oklch 78% 0.13 75) "running low" word at 11px — amber on dark, passes.

**Orphaned-CSS watchlist (verify on edits):** `.env-sub` rule survives with no JSX user (orphan). Removed-and-clean (0 refs both JSX+CSS): env-hero-grid, env-hero, env-attention*, env-view-toggle, env-view-cell, env-list-row*, env-groups, env-group*, env-hero-stats, env-card-amt-row, env-card-of, env-card-overspend-note, env-hero-priority*. SURVIVING + still referenced (do NOT delete): `.env-hero-arrow` (reused by month nav), `.env-hero-stat` + `.env-hero-stat-sub` (reused by HeroStat).
