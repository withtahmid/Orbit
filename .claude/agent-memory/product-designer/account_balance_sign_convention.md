---
name: account-balance-sign-convention
description: Canonical sign convention for account_balances.balance and how the trigger and consumers should agree
metadata:
  type: project
---

`account_balances.balance` is **signed-native from the owner's perspective**: positive for asset/locked accounts, **negative** for liabilities owed. The DB trigger in migration `018_create_update_account_balance_trigger.mts` already produces this convention — `expense` always subtracts from source regardless of account_type, so a credit card debited by $100 ends up with `balance = -100`.

**Why:** The trigger was the source of truth, but multiple call sites (`spaceSummary.mts`, `personal/summary.mts`, `personal/spaceBreakdown.mts`, plus three web components — `OverviewPage.NetWorthComposition`, `AccountsView` totals, `AccountsPage` hero/card) were written as if liabilities were stored *positive-owed* and tried to negate them, causing net worth to add debt to itself. Branch `fix/balance-signed` (May 2026) realigns everyone on the trigger's convention.

**How to apply:** When adding any new analytics or UI surface that reads `account.balance` or `account_balances.balance`:
1. Treat the number as a signed value from owner's POV. Net worth = `SUM(balance)` across all `asset|liability|locked` accounts — **no** `CASE WHEN account_type='liability' THEN -balance` flips.
2. For display, never render a raw `−` sign on liability balances. Use contextual labels via the `<AccountBalanceLabel>` component: "Owed" (liability with `balance < 0`), "In credit" (liability with `balance > 0`), "Paid off" (= 0), "Overdrawn" (asset with `balance < 0`).
3. `transaction.adjust.newBalance` is interpreted literally as the signed column value — callers must pass `-Math.abs(amount)` for liabilities.
4. `netWorthHistory` returns `liabilities` as a **positive owed amount** (it negates the raw signed sum server-side); `netWorth` is provided as a top-level field so consumers don't recompute.

Related: [[liability_budgeting_treatment]] for the YNAB-style payment-envelope idea, which is a separate Phase 2 budgeting concern.
