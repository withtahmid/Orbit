---
name: envelope-target-lockstep-cascade
description: target_amount/target_date must be both-set or both-null; cascade fires only on an explicit non-null→null transition with the other column undefined
type: project
---

DB CHECK (migration 047) enforces: on a non-`cadence='none'` envelope, both target columns must be NULL. The constraint is `(target_amount IS NULL AND target_date IS NULL) OR cadence = 'none'`. Procedural code in `envelop.update.mts` must keep them in lock-step for cadence='none' envelopes too — the CHECK alone does NOT block the half-set case (e.g. `target_amount=5000, target_date=NULL, cadence='none'` satisfies the CHECK but violates the documented lock-step invariant).

**The correct cascade rule (update.mts):**
- Cascade `target_amount → null ⟹ target_date := null` fires ONLY when:
  - incoming `target_amount === null` (explicit clear), AND
  - stored row's `target_amount != null` (a real transition, not a no-op echo of an already-null stored value), AND
  - incoming `target_date === undefined` (caller is not touching date this request)
- Mirror rule for date → amount.

**Update.mts NEW lock-step (lines 130–147):** merged-state check — if exactly one of amount/date is null in the merged post-update state, both clear. Handles every case correctly including the half-set bug.

**Create.mts gap (verified May 2026, branch `rename-plan-goal`):** `procedures/envelop/create.mts` does NOT enforce lock-step. Calling `envelop.create({cadence:'none', targetAmount:5000})` with `targetDate` omitted creates a row with `target_amount=5000, target_date=NULL`, which the CHECK permits because cadence='none'. The web BudgetsPage form serializes both columns, but a half-set row from any other caller (tRPC client, future migration writer) will pass. Fix: mirror the update.mts lock-step check at the top of create.

**Why:** A prior bug had cascade trigger whenever either column was incoming-null, which silently nullified the other column on every no-op edit (e.g. renaming a goal whose deadline was already null would wipe its amount).

**How to apply:**
- When both incoming columns are explicit null: both go to null (lock-step satisfied trivially; both `undefined` checks fail, but that's fine because both are being set to null directly).
- When one incoming is `null` and the other is `undefined`: cascade clears the other.
- When one incoming is `null` and stored is already `null`: cascade skips (no transition). Good — prevents no-op echo from wiping the partner.
- When one incoming is `null` and the other has an explicit new value (not undefined): cascade SKIPS. This is a known intentional behavior — if both columns are in the payload, the caller is explicitly choosing the post-state; the lock-step expectation falls on the caller. **Note:** if a future caller sends `{amount: null, date: "2027-01-01"}` they will end up with a date-only row that violates the DB CHECK and the write will fail. Acceptable because the API is internal and the form serializes both fields consistently.

See `apps/server/src/procedures/envelop/update.mts` lines 119–148.
See `apps/server/src/procedures/envelop/create.mts` for the gap.
