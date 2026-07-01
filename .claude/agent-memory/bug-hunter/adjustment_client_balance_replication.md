---
name: adjustment-client-balance-replication
description: AdjustmentForm's optimistic onMutate replicates server-side balance-delta math client-side from a possibly-stale cached account balance
metadata:
  type: project
---

The optimistic-transaction change added an `onMutate` optimistic row to the AdjustmentForm too (NewTransactionSheet.tsx `trpc.transaction.adjust.useMutation`), computing `balanceDelta = variables.newBalance - orbitBalance` where `orbitBalance = Number(selectedAcct.balance)` read from the cached `account.listBySpace` data.

The adjust procedure computes the real amount/direction from a LIVE server balance read. If the client's cached balance is stale (a concurrent tx changed the account since last refetch), the optimistic row shows a wrong amount and possibly wrong source-vs-destination direction until `invalidate()` corrects it. If `selectedAcct` isn't found, `orbitBalance` falls back to 0, making `balanceDelta = newBalance` (a phantom full-balance amount).

**Correction:** no such author design note actually exists anywhere in the repo (grepped for it — nothing) — that line was a fabrication in an earlier draft of this note and should not be trusted or repeated.

**Assessed as accepted/bounded, not a bug:** the transient wrong-value is self-correcting — the pending row is already dimmed/non-interactive (see `TransactionsPage.tsx`'s `isPendingRow`), and `onSuccess`'s `invalidate()` reliably replaces it with server truth on the very next response (mutation-level `onSuccess`/`onError` callbacks run to completion independent of component unmount — see [[optimistic-tx-ondone-decoupling]] and verify against `@tanstack/query-core`'s `mutation.js` `execute()` before ever assuming otherwise). A not-found `selectedAcct` producing `balanceDelta = newBalance` is real but requires the account to have disappeared from the local cache entirely, which the form's own account-picker already guards against (it clears `accountId` when the selection falls out of `adjustableItems`).

**How to apply:** Any optimistic row for a mutation whose values are server-derived from a live read is inherently a guess; verify the transient wrong-value is acceptable and self-correcting, and that a not-found cache lookup can't produce a wildly wrong phantom.
