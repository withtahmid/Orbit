---
name: project_simplify_budgeting_removal
description: simplify-budgeting branch rips out borrow-from-next-month, reckoning/strict-mode, and carry-policy across web UI; known sparse-page and orphaned-layout artifacts left behind.
metadata:
  type: project
---

The `simplify-budgeting` branch removes three intertwined budgeting concepts from the web app: borrow-from-next-month, reckoning/strict-mode (the `/s/:id/reckoning` route + `ROUTES.spaceReckoning` are deleted), and per-envelope carry policy (`carryIn`/`carryOver`/`carryPolicy` dropped — period pool is now just `allocated`).

**Why:** Collapse the budgeting model to a single honest concept (envelope = planning intent, spending never blocked). Borrow/reckoning/strict were the YNAB-style accountability layer being retired.

**How to apply when reviewing this area (UPDATED after 3rd review loop — several earlier artifacts now fixed):**
- `BudgetDetailPage.tsx` was sparse but is now substantive: Hero card + conditional Goal-progress card + a **Recent transactions** list (`txQuery = transaction.listBySpace limit:10`, rendered for every envelope). The earlier `.ed-table/.ed-borrow-*/.ed-trend-foot` orphans are GONE; only `.ed-empty` remains and IS used (loading/empty states). The `HeroStat` helper still declares a `note?` prop + renders `.ed-hero-note`, but the only call site (the "Position" stat) no longer passes `note` → `note`/`.ed-hero-note` CSS path is now dead. Low severity.
- `BudgetsPage.tsx` create/edit dialog: the carry-policy bare-`<div/>` is FIXED — replaced with a proper `cadence==="none"` conditional `OrbitFieldRow` holding Target amount + Target date. No dead grid cell. Note a no-op `void AlertTriangle;` statement (~line 1941) left as an unused-import suppressor — cosmetic smell.
- `DocsPage.tsx` Drift section is FIXED: now `od-grid-2` with exactly 2 InfoCards. All `od-grid-3` uses (events, permissions, feature-grid) have 3 cards. Reckoning/strict/carry/borrow/matrix copy all rewritten to the new model.
- `EnvelopesView.tsx` KPI strip is 3 items (dynamic KpiStrip — fine).
- `NewTransactionSheet.tsx`: Save button no longer strict-blocked (`disabled={isSaving}` only); StrictModeBanner/useSheetStrictGate fully gone. BUT `.nt-env-row` + `.nt-env-row-label` CSS (the old borrow draw-chip row) is ORPHANED — no JSX consumer (`.nt-env-chip` IS still used inside `.nt-env-card`). `.nt-recover-card`/`.etu-recover-card` legitimately used by surviving Pull card.
- `OverviewPage.tsx`: per-account drift CARD removed; surviving `ov-over` over-allocation banner reuses `.ov-drift-headline/.ov-drift-icon/.ov-over-icon/.ov-drift-title/.ov-drift-sub`. ORPHANED now: `.ov-drift` (card), `.ov-drift-head`, `.ov-drift-rows`, `.ov-drift-row`, `.ov-drift-row-left/-name/-acct/-right` + their `@media` overrides.
- `SpaceSettingsPage.tsx`: `BudgetModeCard` (flexible/strict toggle) removed. General tab's `<div className="grid gap-4">` now wraps a single Card — harmless redundant wrapper.
- `router/index.tsx` + `routes.ts`: `reckoning` route, `analytics/matrix` route, `ReckoningPage`/`MatrixView` lazy imports, and `ROUTES.spaceReckoning` all removed cleanly. `ReckoningPage.tsx` + `MatrixView.tsx` files deleted.

Typecheck passes clean on this branch — no dead imports. Orphaned CSS is the main residue (dead selectors, no runtime breakage). Related: [[project_plan_to_envelope_rename]] (goal envelopes), [[orbit-design-scoping]].
