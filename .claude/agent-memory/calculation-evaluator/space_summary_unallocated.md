---
name: space-summary-unallocated
description: spaceSummary.unallocated formula and the subtle asymmetry between "Income" and "Unbudgeted" that users misread as a bug.
metadata:
  type: project
---

`analytics.spaceSummary.unallocated = spendableBalance - envelopeRemaining` (apps/server/src/procedures/analytics/spaceSummary.mts ~line 305).

Users commonly assume "Income arrived after my last allocation, so Unbudgeted should equal that Income." That equality only holds when **all** of the following are true since the last allocation:
1. No spending out of any envelope (in-envelope expense reduces envelopeRemaining AND spendable equally — no net effect on unallocated, OK).
2. **No cross-space transfers out of scope** — these drain spendable but leave envelopeRemaining unchanged, so unallocated drops by the transfer amount even though `operationalIncome`/`operationalExpense` are NOT affected (transfers are excluded from operational metrics by design — see SQL comment in spaceSummary.mts).
3. No `adjustment` transactions (these DO move both spendable and operational income/expense, so they wash out, OK).
4. The "Eid 26-style" rolling envelope overlay isn't expanding silently — `GREATEST(lifetime_clamp, overlay_clamp)` means a rolling envelope can hold MORE than its lifetime cushion if a single month's allocations exceed that month's spend.
5. The pre-allocation baseline was actually 0 — users who "zero out" by allocating from Monthly Buffer often miss a stray income/adjustment that arrived between sweeps.

**Why:** Investigated 2026-05-22 in `pp's Family` space: dashboard showed Income 2440.15, Unbudgeted 2424.15, gap 16.00. Root cause was TWO transfers totaling 16.00 from pp's Family Cash → Tahmid's Space "Coin Dump" account. Plus a 400.15 baseline (400 income + 0.15 adjustment, never explicitly budgeted) that meant the "zero baseline" was actually 400.15.

**How to apply:** When a user reports `Unbudgeted ≠ Income`, the FIRST diagnostic to run is "transfers OUT of the space's scope_accounts since the last allocation." Second: any income/adjustment older than the last allocation that wasn't subsequently swept. Third: rolling envelopes whose lifetime_clamp and overlay_clamp diverge. The label "Inflow" (cash_income, includes transfers) vs "Income" (operationalIncome, true income only) on OverviewPage.tsx ~line 634-666 is the dual-pane that exposes this discrepancy — point users at the Inflow/Outflow tiles to see the transfer leakage.
