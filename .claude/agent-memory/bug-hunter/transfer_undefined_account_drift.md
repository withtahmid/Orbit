---
name: transfer-undefined-account-drift
description: allocation.transfer treats from.accountId undefined as "aggregate across partitions" for the available check but writes the debit row with account_id=null, creating phantom drift in the unassigned partition
metadata:
  type: project
---

`procedures/allocation/transfer.mts` and `resolveTargetInfo` accept `accountId: string | null | undefined`.

- `accountId === undefined` → `resolveEnvelopePeriodBalance` aggregates ACROSS all account partitions for the available check (see `accountMatch("a", undefined)` returning `TRUE`).
- The actual insert uses `input.from.accountId ?? null` → always writes `account_id = null`.

If source envelope has $0 in unassigned but $1000 pinned to account X, a transfer with `from: { envelopId }` (no accountId) of $500 succeeds the available check (aggregate=$1000), inserts a -$500 row at `account_id=null`. The unassigned-partition breakdown now shows -$500 drift, even though no real overspend occurred.

**Why:** Move/TopUp dialogs omit `accountId`, so `undefined` is the default-shaped call. Reckoning UI also relies on per-partition drift detection for its "rebalance drift" path — phantom drift here would surface as bogus reckon prompts.

**How to apply:** Either coerce undefined→null in `resolveTargetInfo` (scope the available check to the unassigned partition only), or keep aggregate-check semantics but split the debit across partitions proportionally. The current shape mixes the two and breaks the per-account ledger invariant.
