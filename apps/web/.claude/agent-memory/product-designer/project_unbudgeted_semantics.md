---
name: unbudgeted-semantics
description: How Unbudgeted (spaceSummary.unallocated) is scoped per-month, its current-month gating on Budgets pages, and the removal of the 90d overspend nag
metadata:
  type: project
---

**spaceSummary.unallocated is now per-viewed-month** (branch budget-bug-fix-2, 2026-07). Previously the envelope `held` term hardcoded `DATE_TRUNC('month', NOW())`; now it honors `input.periodStart/periodEnd`. Reason: fix "allocating to August doesn't reduce August's Unbudgeted". `spendableBalance` stays window-independent (it's current cash), so for a non-current month Unbudgeted = current-spendable − that-month's-held — a hypothetical, not a real historical/future balance.

**Guard both consumers gate on current month:**
- `BudgetsPage.tsx` renders `<UnbudgetedBanner>` only when `monthOffset === 0`.
- `BudgetMonthPage.tsx` renders the "Currently funded" / "Free after save" stats only when `isCurrentMonth`.
So the mixed-period figure is never *shown* today — the fix is latent/correct-in-isolation, and the banner comment (~line 420-422) is now STALE (says "computed against NOW on the server"). See [[simplify-budgeting-model]].

**resolveSpaceUnallocated stays current-month pinned** (allocation/utils). It feeds transfer/guard callers that legitimately want "now". The two `unallocated` figures agree only for the current month — documented in the spaceSummary comment.

**90d "past overspend" nag removed:** `analytics.unbudgetedTrend` + `personal.unbudgetedTrend` procedures deleted (twin parity preserved), plus the banner button/panel + CSS. Aligned with "overspend is shown, never nagged." `absorbedOverspend` was the ONLY surface for cross-month completed-overspend absorption; it's now entirely gone from the product. Per-month overspend is still shown (BudgetMonthPage "over" chips, BudgetsPage over-count). No orphan refs remain in either app.
