---
name: account-scope-double-count
description: Per-space analytics that scope by `space_accounts` (not `transactions.space_id`) double-count any transaction whose account is shared into multiple spaces.
metadata:
  type: project
---

`spaceSummary.mts` (and `cashFlow.mts`, and most "money-flow" analytics)
scope by `space_accounts` — they treat every transaction touching an
account shared into the space as belonging to that space, regardless of
`transactions.space_id`. The project spec §12 (lines ~1119–1145) documents
this as intentional: "money-flow analytics are account-scoped; category-
like analytics are space_id-scoped". The justification is that
`account_balances` is per-account (no space_id), so spaceSummary's
`periodNet` must equal `balanceHistory`'s delta for the same account
population.

**Why:** Internally consistent BALANCE math — but creates an
attribution paradox when an account is shared into two spaces. The same
expense transaction is counted once per space, so per-space "operational
expense" tiles SUM across spaces to MORE than the user's real outflow.

**How to apply:** When a user reports per-space expense totals "leaking"
across spaces, this is the spec-documented behavior, NOT a coding bug.
The bug, if any, is at the SPEC level — `transactions.space_id` is
treated as a categorization tag inside `spaceSummary` but as the actual
scope inside `transaction/filteredTotals.mts`. The two views show the
user different numbers for the same nominal question. Any "fix" must
choose one rule, and the inline comment in `account/shareWithSpace.mts:16`
("Historical transactions in other spaces remain visible only in those
spaces") suggests product intent leans toward `space_id`-scoped.

**Personal twin (`personal/summary.mts`) is NOT vulnerable** — it filters
`WHERE space_id = ANY(memberSpaces)` (line 281) AND `source/dest = ANY(owned)`,
so each transaction is counted at most once across the entire personal
aggregation. This is why "My Money" agrees with whichever per-space
total is the "real" one (the space the transaction was actually stamped
into).
