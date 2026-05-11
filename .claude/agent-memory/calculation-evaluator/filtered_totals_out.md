---
name: Filtered-totals OUT formula
description: Per-space vs personal transaction filtered totals disagree on OUT — flagged for product decision
type: project
---

The two procedures `transaction.filteredTotals` (per-space) and `personal.transactionFilteredTotals` (cross-space) implement different definitions of IN / OUT:

- **Per-space:** counts only `type='income'` toward IN, only `type='expense'` toward OUT, plus transfer fees toward OUT. Does not consider `adjustment`. Does not restrict by account ownership.
- **Personal:** counts income to owned dest + transfers in from non-owned + adjustments to owned dest. OUT counts expense from owned source + transfers out to non-owned + adjustments from owned + fees on owned-source transfers.

**Why:** Personal mode tracks cash actually flowing into/out of *your* accounts. Per-space mode is supposed to track activity in the space's ledger. The space version's docstring says "OUT counts expenses out of in-space accounts" but the SQL has no account-flow filter — the docstring overpromises.

**How to apply:**
- Pinning down "what counts as OUT" is a product decision, not a clear bug. Flag as ambiguous, don't just patch one side.
- If you find IN/OUT inconsistencies on the TransactionsPage card between `/s/<id>` and `/s/me`, this is the root cause.
- The `+ transfer fee` branch inside the per-space SUM CASE is dead code when `type='expense'` filter is set, and the ONLY contributor when `type='transfer'` is set. That makes the per-space card's IN/OUT meaningless when filtering by type='transfer'.
