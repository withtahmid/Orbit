---
name: budgets-ui-conventions
description: Budgets/BudgetMonth page UI patterns, orbit-design color-token contrast facts, and recurring layout traps
metadata:
  type: project
---

Budgets pages: `src/pages/space/budgets/BudgetsPage.tsx` (grid of envelope cards + summary strip) and `BudgetMonthPage.tsx` (per-envelope planning cards). Each embeds CSS in a `<style>` template string (`ENV_STYLES` / `PLAN_STYLES`). Distribution bar (colored segments + white "cash you have" tick) appears on both, current-month only.

**orbit-design token contrast (measured, dark theme, tokens in `src/styles/orbit-design.css`):**
- `--fg-4` = oklch(48%) → ~2.94:1 on card / 3.03:1 on bg. **FAILS WCAG AA (4.5:1) for normal text <18px.** Used for small secondary captions. Bump to `--fg-3` (5.28:1, passes) for any body/caption text.
- `--fg-3` = oklch(62%) → 5.28:1, passes AA.
- Colored tones all pass comfortably on dark bg: income 8.7, expense 6.7, warn 9.4, gold 10.9, brand 8.2.
**Why:** fg-4 is used app-wide for subtitles; flag new fg-4 body text, prefer fg-3.

**Recurring trap — dangling flex dividers (STUBBORN — mis-fixed twice; FIXED + verified on feat/budgets/improvements):** `.env-summary-stats` lays 3 hero stats separated by standalone `.env-summary-divider` spans with `flex-wrap`. The band where the 3rd stat wraps to row 2 (stranding a divider after "Spent") is much WIDER than it looks. Fix now in place: `@media (max-width: 1439px) { .env-summary-divider { display: none } }` (BudgetsPage.tsx ~L1836). Round-3 browser check: dividers hidden across 1281–1439 (no dangling), shown on a single stat row at 1440 & 1655. Verified clean — do not re-flag unless the breakpoint or stat count changes.

**Distribution-bar segments — `:last-child` was a DEAD selector (FIXED + verified):** the right-radius rules never matched because `.plan-dist-over`/`.plan-dist-tick` spans render AFTER the segments in the same bar. Now fixed by applying `borderTopRightRadius`/`borderBottomRightRadius` + `borderRight:"none"` INLINE on the last `.map` segment (`i === segs.length - 1`) — BudgetsPage 5px, BudgetMonthPage 7px. The `:last-child` CSS was removed (dead-comment lines left in place, accepted). Round-3 computed-style check confirmed last seg has the radii + borderRight none on both pages.

**Plan hero refactor (BudgetMonthPage, feat/budgets/improvements — VERIFIED round 4, do not re-flag):** `.plan-summary` grid replaced by `.plan-hero` flex-column: `.plan-hero-top` (flex-wrap) holds `.plan-hero-primary` (big live verdict, left) + `.plan-hero-side` (2 reference stats, `border-left` divider, right); distribution bar spans bottom.
- Reveal-together is airtight by construction: `heroReady = summaryQuery.data != null && (hydrated || envelopes.length===0)` gates the primary amount/note; the side "Total budgeted" stat only needs `hydrated`. So the big amount can never show a number while Total budgeted still shows "—". Confirmed no transient violation under network throttle.
- `.plan-hero-note` has `min-height: 3.1em` only `@media (max-width:520px)` (= 35.65px at 11.5px font) to reserve 2 lines so the "checking your balance…" placeholder→settled swap doesn't shift the bar/grid. hero-top height stable ±0px across reloads at 375px.
- Side stats vary by month type: current = Total budgeted + Cash you have; past = Spent + (Over/Under budget | Net change); future ≤ now+1 month = Last month spent ("so far, for reference") + Net change; ≥ now+2 months = Net change only. Single-stat hero (e.g. 2026-09) with lone right-aligned `border-left` stat looks clean at 375px & 1440px — not broken.

**Reconcile mode (past month, click Reconcile):** coach hint ("will likely fall short") suppressed via `!reconcileMode` in `showHint`; quick-set chips drop the "Avg" chip in reconcile (`...(reconcileMode ? [] : [{label:"Avg"...}])`), leaving month-actual + "Current" — two chips fit one row at 375px & 1024px, no wrap. Cancel restores normal locked view ("Was budgeted" hero). Non-reconcile plan/future months keep the 3rd Avg chip.

**Detail-page "Projected end" tile tone (BudgetDetailPage ~L740):** `total = envelope.allocated`; tone is expense/income only when `total > 0`, else `fg` (neutral) — an unallocated envelope shows neutral, not green "on track". Budgeted envelopes keep green/red. Verified.

**Touch targets under 44px on mobile:** month-nav arrows `.env-hero-arrow` are 26×26; `.plan-chip` quick-set chips are ~24px tall; topbar `.od-btn` are 36px. Inputs `.plan-row-input` are 40px with 16px font (good — avoids iOS focus-zoom).
