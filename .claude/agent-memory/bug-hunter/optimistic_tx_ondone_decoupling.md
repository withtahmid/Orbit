---
name: optimistic-tx-ondone-decoupling
description: NewTransactionSheet optimistic UI fires onDone()/idem.rotate() synchronously after mutate.mutate(), so ANY server rejection discards the user's form input
metadata:
  type: project
---

The optimistic-transaction-creation change (branch `transaction-optimistic-update`) moved `onDone()` + `idem.rotate()` out of each mutation's `onSuccess` and into the submit handler, firing them synchronously right after `mutate.mutate(...)`.

**Consequence class to watch:** Because `onDone()` now fires unconditionally (before the request resolves), any server-side rejection (Zod `.positive()` on amount, permission, 500, network) no longer keeps the form open with the user's data. On "Save & add another" the formKey bump wipes the entry; on plain Save the sheet closes. The only feedback is a delayed `toast.error` from `onError`. None of the 4 forms validate `amount > 0` client-side (they only guard account/category/envelope/fee), so an empty amount (`Number("")===0`) always round-trips and always fails `.positive()` — losing the entry.

**Why:** The decoupling was intentional (non-blocking rapid entry against cold-start free-tier DB). The lost-input-on-failure is the accepted-but-under-appreciated tradeoff. If revisiting: add a client `amount > 0` guard before `mutate.mutate()` in all 4 forms, or gate `onDone()`/formKey-wipe on the optimistic row NOT being immediately rejectable.

**How to apply:** When reviewing further changes here, treat "does a failed save preserve user input?" as a first-class question. The old invariant (failure keeps form intact) no longer holds.

Related: `computeDelta`/`applyDelta` in `useOptimisticTransactionCache.ts` will propagate a `NaN` amount into `filteredTotals` cache (inTotal/net/avgPerDay) that `reverseDelta` cannot undo (NaN-NaN=NaN) — persists until the next successful invalidate. Empty-amount(0) case is benign; only non-numeric NaN poisons totals. **Correction:** `OrbitAmountCard` renders `<input type="number">`, and browsers coerce that input's `.value` to either a valid numeric string or `""` — non-numeric text can't reach `amount` state, so this NaN path was never reachable in practice.

**Resolved (same session, live edit by the human author):** all four forms now guard `!(Number(amount) > 0)` (or the equivalent `delta === 0` check for Adjustment) before calling `mutate.mutate()`, and every `onError` now shows `toast.error(..., { duration: Infinity })` with the amount in the message — so a rejected/empty-amount submit no longer silently loses input, and the failure signal persists until dismissed. The core lesson (treat "does onDone fire before the request resolves" as a first-class review question) still holds for future changes to this pattern.
