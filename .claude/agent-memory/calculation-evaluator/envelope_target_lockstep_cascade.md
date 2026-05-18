---
name: envelope-target-lockstep-cascade
description: target_amount/target_date must be both-set or both-null; cascade fires only on an explicit non-null→null transition with the other column undefined
type: project
---

DB CHECK (migration 047) enforces: on a `cadence='none'` envelope, `target_amount` and `target_date` are either both NULL or both NOT NULL. Procedural code in `envelop.update.mts` must keep them in lock-step.

**The correct cascade rule:**
- Cascade `target_amount → null ⟹ target_date := null` fires ONLY when:
  - incoming `target_amount === null` (explicit clear), AND
  - stored row's `target_amount != null` (a real transition, not a no-op echo of an already-null stored value), AND
  - incoming `target_date === undefined` (caller is not touching date this request)
- Mirror rule for date → amount.

**Why:** A prior bug had cascade trigger whenever either column was incoming-null, which silently nullified the other column on every no-op edit (e.g. renaming a goal whose deadline was already null would wipe its amount).

**How to apply:**
- When both incoming columns are explicit null: both go to null (lock-step satisfied trivially; both `undefined` checks fail, but that's fine because both are being set to null directly).
- When one incoming is `null` and the other is `undefined`: cascade clears the other.
- When one incoming is `null` and stored is already `null`: cascade skips (no transition). Good — prevents no-op echo from wiping the partner.
- When one incoming is `null` and the other has an explicit new value (not undefined): cascade SKIPS. This is a known intentional behavior — if both columns are in the payload, the caller is explicitly choosing the post-state; the lock-step expectation falls on the caller. **Note:** if a future caller sends `{amount: null, date: "2027-01-01"}` they will end up with a date-only row that violates the DB CHECK and the write will fail. Acceptable because the API is internal and the form serializes both fields consistently.

See `apps/server/src/procedures/envelop/update.mts` lines 119–148.
