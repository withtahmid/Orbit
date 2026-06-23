---
name: project_simplify_budgeting_removal
description: simplify-budgeting branch ripped out borrow/reckoning/carry/matrix/account-tab; rounds 2 & 3 verified clean
metadata:
  type: project
---

The `simplify-budgeting` branch removed borrow, reckoning, carry-policy, the analytics Matrix view, and the Allocations "By account" tab.

**Round-2 fixes (verified visually correct, 2026-06-23):**
- `BudgetDetailPage.tsx`: sparse page filled with a new "Recent transactions" `.od-card.ed-section` (`.ed-tx-*` classes). Pruned dead CSS (`.ed-table*`, `.ed-borrow*`, `.ed-trend-foot`) — grep confirms zero remaining refs. `HeroStat` `note` prop is now dead (never passed) but harmless.
- `BudgetsPage.tsx` CreateOrEditEnvelopeDialog: Cadence is now standalone full-width `OrbitField` (line ~1799); the `OrbitFieldRow` wrapper now holds only the two target fields. No empty placeholder div. Stale comment at ~line 1083 still says "carry-policy radios" but no such control exists.
- `DocsPage.tsx`: Overspend uses `od-grid-2`. `od-grid-2` goes 2-col at min-width 640px (not 720). Balanced.
- `AllocationsView.tsx`: now 2 tabs (By envelope / Totals), default `by-envelope`. Clean.
- `AnalyticsPage.tsx`: 10 ENTRIES, `{ENTRIES.length} views` text correct. Matrix fully gone; router has exactly 10 view routes.
- `EnvelopesView.tsx`: KPI strip dropped "Borrowed in" → 3 KPIs. KpiStrip self-balances (N cols at lg for N≤4).

**Round-3 fixes (verified visually correct, 2026-06-23):**
- `AllocationsView.tsx` ByEnvelopePanel rewritten: one solid bar per envelope (`backgroundColor: r.color`, width = `total/max`), legend + per-account segments removed. 3-col grid `minmax(120px,200px) minmax(0,1fr) 96px` unchanged, truncation/empty/loading states intact. Reads `analytics.allocations` `envelopes[].color`/`.allocated` — both exist. Clean at all breakpoints (bar is the flex/middle column, never overflows).
- `BudgetMonthPage.tsx`: pure date-helper swap to APP_TZ (`makeAppTzDate`/`getAppTzYear`/`getAppTzMonth`) + removal of `carryIn`/`borrowedIn/Out` references and `accountId`/`periodStartUtc` on allocate. `periodStart` is a component-scope useMemo; no layout change. The `.plan-row-borrow*` CSS block removed with no remaining refs.
- `DocsPage.tsx`: "Eleven"→"Ten", label "11"→"10", Matrix list item removed, Drift cards now `od-grid-2` (2 cards). Text-only.

**Why:** product simplification, not tech-debt.
**How to apply:** Two carried-over minor items remain — DocsPage line ~906 placeholder still says "11 sub-view cards" (should be 10); AnalyticsPage 10-card 3-col grid leaves a single orphan in the last row at desktop. KpiStrip odd-count (3) shows a half-width orphan on the sm tablet band — pre-existing component behavior, newly exposed by EnvelopesView.
