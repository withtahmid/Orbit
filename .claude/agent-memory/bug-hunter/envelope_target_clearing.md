---
name: envelope-target-clearing
description: envelop.update + envelop.create both enforce lock-step on (target_amount, target_date) — but the two procedures handle a half-set pair DIFFERENTLY (create rejects, update silently clears both).
metadata:
  type: feedback
---

As of the `rename-plan-goal` branch, the target lock-step is enforced at two layers:

- DB layer (migration 047): CHECK only blocks targets on non-rolling cadence. It does NOT block half-set pairs on `cadence='none'`.
- API layer: every create/update path must enforce both "no target on non-rolling" AND "amount XOR date is set" lock-step.

**Asymmetry to remember:**

- `apps/server/src/procedures/envelop/create.mts` (lines 73-85): half-set pair → `TRPCError BAD_REQUEST`. Caller must fix and resubmit.
- `apps/server/src/procedures/envelop/update.mts` (lines 144-152): half-set pair (computed against the merged post-update state) now throws `BAD_REQUEST`, matching create.mts. FIXED on `rename-plan-goal`.

Prior behavior (kept for context): update.mts used to silently null both columns on a half-set merge — so a PATCH like `{ targetAmount: 5000 }` against a row with stored `target_date=NULL` would silently drop the new amount.

**How to apply:**
- When reviewing target-related code in update.mts, trace the merged-state computation, not just the incoming patch.
- When adding a new envelope-mutation procedure, check whether you want the create-style throw or the update-style silent-clear; don't accidentally inherit whichever pattern is nearest.
- DB invariant: a `cadence='none'` envelope can still legally be `(target_amount=NULL, target_date=NULL)` (no goal) OR both set (active goal). Half-set is API-rejected, not DB-rejected.

Related: [[target_date_tz_drift]].
