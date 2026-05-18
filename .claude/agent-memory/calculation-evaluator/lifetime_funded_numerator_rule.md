---
name: lifetime-funded-numerator-rule
description: Goal progress UI must use lifetimeFunded as numerator and pctSaved/pctComplete (clamped) for bar fill, both fed from the same SQL source
type: project
---

Goal progress signal across the app is computed as:
- Numerator: `lifetime_funded` = `SUM(amount) WHERE amount > 0 AND kind IN ('allocate','borrow')`
- `pctSaved = clamp(0, 100, lifetimeFunded / targetAmount * 100)` (null when no target)
- `pctComplete` is a legacy alias === `pctSaved` (do not reintroduce divergence)

**Why:** Spending from a completed goal must not roll back completion. Using `lifetimeFunded` (positive-only) instead of net `allocated - consumed` keeps the progress monotonic w.r.t. user funding intent.

**How to apply:** When reading goal progress in the web app, always pair `Money amount={lifetimeFunded ?? 0}` with `ProgressBar value={(pctSaved ?? pctComplete) / 100}`. Bar caps at 100% by design (it's "% complete", not "% over target"); over-funded surplus belongs in a separate footer like `goalSaved - targetAmount`.

Sites that must agree (verified 2026-05-15):
- `apps/web/src/pages/space/budgets/BudgetsPage.tsx` envelope card + list row
- `apps/web/src/pages/space/OverviewPage.tsx` Goals list
- Server source: `apps/server/src/procedures/analytics/envelopeUtilization.mts` and `apps/server/src/procedures/personal/envelopeUtilization.mts` (personal twin)

See [[envelope-ledger-kinds]] for which `kind` values feed lifetime_funded.
