---
name: account-running-balance
description: computeBalanceAfter / computeRowAccountBalances invariants — window ORDER must match list keyset order; leak boundary is the accountIds arg
metadata:
  type: project
---

`transaction/utils/accountRunningBalance.mts` powers the always-on "Balance after" column on the Transactions page + AccountDetailPage Transactions tab.

Invariants that MUST hold when reviewing changes here:
- The window `ORDER BY (transaction_datetime, id)` is reversed vs the list's `ORDER BY (transaction_datetime DESC, id DESC)`, but the cumulative-to-current-row SET is identical, so balances align with visible row order. If either order changes independently, the "balance after" stops matching the row it sits on.
- Both funcs scan the account's **full history (all spaces, no space filter)** so the newest row's balance equals `account_balances.balance` (matches Accounts page). Consequence: in a filtered/personal view, the newest *visible* row's balance may not equal current balance if newer txns exist outside the filter — documented tradeoff, not a bug. See [[running_balance_after]].
- Leak boundary = the `accountIds` arg to `computeRowAccountBalances`. Personal feed passes only owned accounts (`ownedSet`-filtered page accounts); space feed passes all page accounts. Single-account path uses `computeBalanceAfter` and the id is already owned-intersected upstream.
- Signed effect mirrors migration 018 trigger: +amount when dest of income/transfer/adjustment, -amount when source of expense/transfer/adjustment. Transfer fees are their own expense rows.

**How to apply:** When reviewing this column, check (1) window order vs list order still match, (2) the accountIds arg is owned-scoped on the personal path, (3) LIABILITY accounts: header shows `-balance` but this column shows raw signed balance (positive) — a known display asymmetry, flag only if the intent is to unify them.

Feature verified CLEAN as of 2026-07-01 (branch fix-transaction-filter): plural/singular filter precedence uniform across list/filteredTotals/personal twins, grid-template column counts match header-cell counts at every breakpoint, `?cat=` deep-link migration complete (no lingering `?category=` emitters), personalCategories opt-in gating correct.
