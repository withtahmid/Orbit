---
name: envelope-target-clearing
description: envelop.update lock-step cascade between target_amount and target_date — round-3 fix closes the "no-op rename wipes targets" case but leaves an orphan-deadline edge case (amount=null + date=non-null persists).
metadata:
  type: feedback
---

`apps/server/src/procedures/envelop/update.mts` (~lines 130-150) implements a lock-step coupling so the UI never has to render a deadline without a goal (or vice versa). The cascade only fires when:

1. The incoming column is explicit `null`, AND
2. The stored column was previously non-null, AND
3. The OTHER incoming column is `undefined` (not just null).

Round 3 fixed the previous bug where a no-op rename (web form re-sends `{amount, date: null}` because the date input is blank) wiped the stored amount — by gating cascade on "stored was non-null" condition 2.

**Remaining hole (orphan deadline state):**

When a goal envelope stores both `{amount, date}` and the user explicitly clears ONLY the amount (form sends `{targetAmount: null, targetDate: <Date>}`), neither cascade arm fires:

- Cascade 1: amount is null, stored amount was non-null — but `targetUpdates.target_date !== undefined` (it's a Date), so this skips.
- Cascade 2: date is not null, so this skips entirely.

Result: stored as `{target_amount: null, target_date: <Date>}` on a cadence='none' envelope. Migration 047 CHECK constraint does NOT block this — it only blocks targets on non-rolling envelopes. The UI now has a deadline with no goal — exactly the lock-step invariant the comment promises to uphold.

**How to apply:**
- For protected lock-step pairs, always test all four corner cases: (both null, both non-null, A null & B set, A set & B null). The cascade can't just look at the OTHER column's input; it needs to consider whether the resulting persisted row violates the invariant.
- Better shape: a final-row check `if (targetUpdates.target_amount === null XOR targetUpdates.target_date !== null) → null both` based on the merged state (stored row + incoming patch).
- Or split into a "clear targets" sentinel so the client signals intent unambiguously.

Related: [[target_date_tz_drift]].
