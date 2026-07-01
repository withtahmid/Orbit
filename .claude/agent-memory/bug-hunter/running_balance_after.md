---
name: running-balance-after
description: computeBalanceAfter (accountRunningBalance.mts) statement-balance window — signed-effect correctness vs trigger, and its scope gaps vs the filtered list
metadata:
  type: project
---

`apps/server/src/procedures/transaction/utils/accountRunningBalance.mts` (as of 2026-07-01) exports TWO helpers:
- `computeBalanceAfter(qb, accountId, txIds)` — single-account window `SUM(...) OVER (ORDER BY transaction_datetime ASC, id ASC ROWS UNBOUNDED..CURRENT)` over the account's FULL history, then `WHERE id = ANY(txIds)`. Used when `accountIdFilter.length === 1`.
- `computeRowAccountBalances(qb, txIds, accountIds)` — multi-account: expands each tx into double-entry postings (income/expense/adjustment→1 posting, transfer→2), `SUM(effect) OVER (PARTITION BY account_id ORDER BY dt,tx_id)`. Used otherwise. `accountIds` is BOTH the scan bound AND the personal leak boundary (personal passes only owned page accounts, so a transfer's non-owned leg emits no balance).

Output shape is now `account_balances_after: Record<accountId,string>` (was `balance_after` string) on `transaction.listBySpace` (list.mts ~L215-260) and `personal.transactions` (~L279-346). Single-account path wraps its map into `{ [accountId]: bal }`. Empty `{}` when no data.

Signed-effect CASE is CORRECT vs the balance trigger (migration 018 `__apply_transaction_balance_effect`):
- income/transfer/adjustment to destination = +amount; expense/transfer/adjustment from source = -amount.
- Adjustment rows set exactly ONE of source/dest (adjust.mts CASE on newBalance vs current), never both, so the two-CASE form is equivalent to the trigger's either/or. Not a bug.
- Transfer fee is a separate `type='expense'` row, `source_account_id=sourceAccountId`, same `transaction_datetime` as the transfer (transfer.mts ~L118) — counted naturally as -amount. Correct.
- Newest row's cumulative == account_balances.balance (window covers all history regardless of datetime; backdated rows fine). Verified correct.

INTENTIONAL surprises (documented in the file's header comment, NOT bugs) — but they make `balance_after` diverge from the visible filtered list:
1. With type/date/search/amount filters active alongside the single account, running deltas between visible rows won't equal visible amounts (window ignores filters). "True statement balance."
2. PERSONAL view: window has NO space filter, but the personal LIST is filtered to `spaceFilter` (member spaces only; resolveMemberSpaceIds deliberately excludes spaces the user was removed from even if they still own the account). So an owned account shared into a now-non-member space contributes to `balance_after` but its rows are invisible in the list → balance jumps by unexplained amounts. Number still equals the real account balance. Flag as Medium UX inconsistency, not a wrong number.

Client (TransactionsPage.tsx) now hard-codes `showBalance = true` — the Balance column ALWAYS renders (not just single-account). `isStatementMode = f.accountIds.length === 1` only toggles the "running balance" banner + hides the per-line account dot. `rowBalanceEntries(t)` reads `account_balances_after`, pushes source-leg then dest-leg (From→To order), guarded with `map[id] != null`. Server single-account gate uses `accountIdFilter` (plural `acc` array collapsed), aligned because the page only sends plural `accountIds`.

The signed-effect CASE in BOTH helpers is CORRECT vs trigger (see below); `computeRowAccountBalances` UNION mirrors the same +dest/-source rule.
