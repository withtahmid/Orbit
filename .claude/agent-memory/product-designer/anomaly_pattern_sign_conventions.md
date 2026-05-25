---
name: anomaly-pattern-sign-conventions
description: Recurring anomaly — sign conventions for stored signed/unsigned amounts drift between server SQL and JS consumers
metadata:
  type: feedback
---

When auditing any "amount stored as a number" column (account balance, envelope remaining, allocation amount), check whether the SQL writer and every JS reader agree on a single sign convention. Multiple sites in Orbit have been found where the writer stored a signed value but a downstream consumer assumed positive (or vice versa), with the bug hidden by a compensating `Math.abs` somewhere else in the chain.

**Why:** The repo has multiple authors and reviewers, and a single ambiguous data type (signed numeric without a sign-doc) tends to fork conventions per surface. The trigger in migration 018 stores liability balances **negative** but the docstring in `netWorthHistory.mts` line 17-19 falsely claimed "we return positive numbers and JS does the flip" — a pattern of stale comments outliving their original truth.

**How to apply:** When reviewing or planning a change to any numeric column with a domain meaning (balance, amount, remaining, delta, target, allocation):
1. Locate the canonical writer (often a DB trigger or single procedure) and treat it as the source of truth for the convention.
2. Grep every reader. For each, ask: does this reader do a sign flip? Does the flip match or contradict the writer?
3. Look for `Math.abs(...)` calls on the column — they are often masking a sign mismatch rather than handling a legitimate magnitude need.
4. Look for `CASE WHEN <type column>` flips in SQL — they encode an assumption about the writer's convention that may be stale.
5. Update or add docstrings that state the convention in one place, and link other readers to it via comments.

Concretely audited and fixed for `account_balances.balance` in branch `fix/balance-signed`. The same anomaly class is worth checking for `transactions.amount` (always positive magnitude per the trigger; signed effect derived from `type` + which side), `envelop_allocations.amount` (signed: positive = allocate, negative = de-allocate), and `account_balances` deltas in `balanceHistory` / `netWorthHistory` back-walks.
