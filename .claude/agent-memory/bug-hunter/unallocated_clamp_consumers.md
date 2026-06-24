---
name: unallocated-clamp-consumers
description: Web consumers of spaceSummary.unallocated assume linear 1:1 response to allocation; breaks under the GREATEST(0,…) held clamp
metadata:
  type: project
---

The server-side held/unallocated invariant is `unallocated = spendable − Σ max(0, allocated − consumed)` (clamp lives in `spaceSummary.mts`, `personal/summary.mts`, `allocation/utils/resolveSpaceUnallocated.mts`). Corollary: allocating into an ALREADY-overspent envelope does NOT reduce unallocated.

**Why:** the clamp is a cash-conservation invariant (overspent cash already left accounts). It is correct and was re-instated after the buggy revert that removed it (Unbudgeted 3,240.75 > net worth 1,105.49).

**How to apply:** any web code that predicts unallocated-after-an-allocation by subtracting an allocation delta linearly is WRONG whenever an overspent (drift) envelope is in scope.
- `BudgetMonthPage.tsx` — FIXED on branch `budget-bug-fix` (2026-06-24): now uses `heldDelta = Σ (max(0,planned−consumed) − max(0,allocated−consumed))`, the correct clamped mirror. Residual trap: `unallocatedNow = summaryQuery.unallocated` is always CURRENT-month (spaceSummary ignores its period input for held), but heldDelta sums over the VIEWED month's envelopes — window mix when viewing a non-current month.
- `EnvelopeAllocateDialog.tsx` models the clamp correctly (`alreadyOverspentBy`, `amountCoveringOverspend`) — reference pattern. BUT the warning's `utilizationQuery` is hard-pinned to `new Date()`'s month while `resolvePeriodStart()` can target NEXT month via `periodChoice` → next-month allocations show this-month overspend.
- `analytics/views/AllocationsView.tsx` — FIXED on `budget-bug-fix`: TotalsPanel now reads `held`/`unallocated` from `spaceSummary` instead of re-deriving. KPI "Unallocated" can show negative (over-budgeted); partition "Free" cell is `Math.max(0, unallocated)`, so bar and KPI intentionally differ in sign.

**spaceSummary window caveat:** `analytics/spaceSummary.mts` held/`unallocated`/`envelopeRemaining` are ALWAYS computed against `DATE_TRUNC('month', NOW())`; the `periodStart/periodEnd` input only scopes income/expense. Never trust `unallocated` as a past/future-month figure.
