---
name: carry-both-absorb-gap-anomaly
description: Known UX pitfall where "Absorb" on a carry=both envelope causes a persistent gap between account net worth and envelope-remaining totals, with no UI explanation.
metadata:
  type: project
---

The `carry_policy='both'` ("honest") mode and the `reckoning.acknowledge(resolution='absorbed')` action are **independent mechanisms** that the UI presents as if they cancel each other out. They don't.

**Why:** `acknowledge` only writes a `reckoning_acknowledgments` row to silence the banner — it does NOT mutate envelope state (`apps/server/src/procedures/reckoning/acknowledge.mts:24` docstring is explicit: "this procedure ONLY records the user's acknowledgment"). Meanwhile `carry_policy='both'` keeps signed prev-period remaining alive forever in `carriedIn` (`resolveEnvelopePeriodBalance.mts:108-115`). So an April overspend of −2,250 is permanently carried into May's `remaining` math regardless of being "absorbed."

The math is self-consistent in [[envelope_held_clamp_invariant]]:
- `unbudgeted = spendable − envelopeHeld − planHeld` (`resolveSpaceUnallocated.mts:165`)
- `envelopeHeld` per envelope is `GREATEST(0, carryIn + allocated − consumed)` (`resolveSpaceUnallocated.mts:132-145`) — the clamp prevents over-spend from inflating free cash.
- This causes a structural gap of `|overspend|` between `SUM(envelope remaining)` (which can be negative per-envelope) and `spendable − planHeld` (which floors at 0 per envelope). The gap is "absorbed debt" sitting nowhere visible.

**How to apply:** When auditing budgeting UX, treat "user can absorb in the reckoning UI but their carry policy is 'both'" as a contradiction. Either:
1. The reckoning UI should reject `absorbed` for `carry_policy='both'` envelopes (or auto-switch them to `positive_only` so the debt actually clears), or
2. The space dashboard should explicitly surface a "Carried debt: X" line that explains the spendable-vs-remaining delta, or
3. `absorbed` should write a compensating zero-out allocation row at the post-overspend period so `carriedIn` becomes 0 in subsequent periods.

Related to [[envelope_category_coupling_decision]] insofar as both touch how the budgeting model maps onto user mental models.
