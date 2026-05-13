---
name: locked-account-substrate
description: `account_type='locked'` excludes the account from spendable balance and `resolveSpaceUnallocated`'s free-cash, but accepts deposits and contributes to net worth. The right substrate for FDR/DPS principal.
metadata:
  type: project
---

`accounts.account_type` is an enum `asset | liability | locked` (migration 0006).

- `asset` — counts in spendable and free-cash positively.
- `liability` — counted negatively in spendable / net worth.
- `locked` — `resolveSpaceUnallocated` returns 0 for these (`resolveSpaceUnallocated.mts:115`); they're excluded from `spendableBalance` but accumulated into `lockedBalance` in `personalSummary` / `spaceSummary`.
- `resolveTransactionPermission` refuses `expense` and `transfer-out` from `locked` accounts (`resolveTransactionPermission.mts:188`). Income INTO a locked account is allowed; transfers IN are allowed. So a locked account is write-only with respect to cash flow once funded.

**Why this matters for [[dps-product-plan]]:** A DPS principal is exactly this — money that left checking, that you can't easily spend, that should not inflate free cash, but is still net worth. Model the DPS-principal side as a locked account; the monthly installment becomes an ordinary `transfer` from the user's linked savings account into the DPS locked account. No new transaction type needed.

**How to apply:** Whenever a feature spec calls for "money that exists but isn't spendable", reach for `account_type='locked'` rather than inventing a parallel ledger. The trigger-driven `account_balances` and all analytics already handle it.
