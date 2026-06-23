---
name: simplify-budgeting-model
description: The simplified (no carry/borrow/reckoning/strict/per-account) budgeting model and where its retired concepts can still leak in the UI
metadata:
  type: project
---

The `simplify-budgeting` branch retired: per-account allocation ("drift"/Matrix view), borrow-from-next-month, monthly carry-over, reckoning, strict-mode space gate, and the 2D allocation matrix. Canonical spec: `apps/server/src/procedures/analytics/CLAUDE.md` (migration 048). Allocations are now ONE row per (envelope, period), space-wide, NO `account_id`.

**Why:** Deliberate simplification — "envelopes are intent, accounts are the ledger." Overspend is shown, never blocked or nagged.

**How to apply:** When reviewing budget/analytics UI, watch for leftover per-account framing. The `analytics.allocations` procedure has NO personal twin; per-space allocation views must guard `space.isPersonal`. Note: "Per-account breakdown" in `BalanceHistoryView` is NOT a leak — per-account balance reporting is valid; only per-account *allocation* was retired. The `(next month)` choice in EnvelopeAllocateDialog is a legitimate pre-allocation feature, NOT the retired borrow feature.

**Known unresolved findings (audit 2026-06-23, branch HEAD 499d188d), not yet fixed:**
1. **Goal "stays complete after you spend" promise is now FALSE.** Collapsed to one mutable allocation row, `lifetime_funded` in `envelopeUtilization.mts` = `SUM(a.amount)` = net allocated. Spending (in `transactions`) still doesn't touch it, BUT moving/deallocating allocation out of a goal now silently de-completes it. Docs (`DocsPage.tsx:583`) + comment (`envelopeUtilization.mts:81`) still promise cumulative-positive-contributions. Recommend dropping the promise (the simplify-consistent path), not adding a monotonic `funded_total` column.
2. **"Drift (legacy)" KPI** still shipped in `AllocationsView.tsx` Totals tab (~line 234) + Drift explainer (~line 252), fed by `analytics/allocations.mts` `drift` field — while DocsPage Overspend section says drift is retired. Direct contradiction; "(legacy)" label shouldn't ship.
3. `analytics/allocations.mts` sums allocation **all-time, no period filter** — inflates "Earmarked"/By-envelope bars without bound as monthly rows accrue. Should window like `envelopeUtilization`.
4. `EnvelopeAllocateDialog.tsx` `resolvePeriodStart()` builds month boundaries in **UTC**, violating the APP_TZ rule — can target wrong month's row near boundary for non-Dhaka users.
5. Stale copy: BudgetsPage envelope modal subtitle (~line 1733) says "rolled-over"; BudgetDetailPage fallback sub (~line 120) says "Allocation history" (history was removed).
6. **Attribution loss in shared spaces**: collapsed row keeps only last writer's `created_by`. No UI surfaces "who moved X". Biggest shared-space regression; accept explicitly or add append-only audit log later.

The reckoning page + Matrix view are fully deleted with no orphan routes/nav (verified). Transfer/Top-up/Move flow, "Free trapped cash", overspend-shown-not-blocked, personal-space guards are all coherent.
