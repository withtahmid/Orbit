---
name: running_balance_helpers
description: accountRunningBalance.mts computeBalanceAfter (single-acct) & computeRowAccountBalances (multi-acct) signed effects, ordering, space-scope divergence
type: project
---

`apps/server/src/procedures/transaction/utils/accountRunningBalance.mts` computes
"balance after this transaction" and mirrors the balance trigger (migration 018).

Signed effects (both helpers, verified against trigger + DB CHECK constraints in
0013_create_transactions_table.mts):
- income: +amount to destination (dst NOT NULL, src NULL)
- expense: -amount to source (src NOT NULL, dst NULL)
- transfer: +dst, -src (both NOT NULL, distinct) — two postings
- adjustment: src XOR dst set (CHECK `(src NOT NULL) <> (dst NOT NULL)`). adjust.mts
  sets src on decrease (-amount), dst on increase (+amount), rejects delta=0. Never both.
  computeRowAccountBalances' two adjustment UNION arms are therefore mutually exclusive
  per row — exactly one fires, matching the trigger. CORRECT.

Ordering: window uses (transaction_datetime/dt ASC, id/tx_id ASC); list view uses DESC
on the same two keys. Total order is consistent (DESC is exact reverse of window ASC).
PARTITION BY account_id isolates accounts; a transfer's two postings live in different
partitions so they don't interfere. CORRECT.

Account scope (`WHERE source_account_id/destination_account_id = ANY(accountIds)` or
`= accountId`) only filters on the PARTITION KEY, applied BEFORE the window; it drops
whole partitions and never truncates a kept account's cumulative. SAFE by construction.

**Space scope now REMOVED (current version, verified 2026-07-01):** both helpers scan
the account's FULL history across all spaces (no space_id filter in the CTE) — the
docstring explicitly says so and it now MATCHES the trigger (which is global per account).
So each returned value == account_balances.balance at the account's newest row. The old
latent cross-space understatement bug is GONE. Callers pass their own account-id scope:
list.mts passes all page accounts; personal.transactions passes only owned accounts
(leak boundary, so a transfer's non-owned leg yields no balance). CORRECT.
