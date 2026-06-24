---
name: unbudgeted-cash-identity
description: The clamp on envelope "held" (GREATEST(0, allocated-consumed)) is a cash-conservation invariant, not cosmetic; removing it pushes Unbudgeted above net worth. Verified on real data.
metadata:
  type: project
---

Unbudgeted (a.k.a. `unallocated`) is computed identically in `analytics/spaceSummary.mts`,
`allocation/utils/resolveSpaceUnallocated.mts`, and (with a per-owner twist) `personal/summary.mts`:

    spendable = Σ assets − Σ liabilities  (locked excluded)
    held_e    = GREATEST(0, allocated_e − consumed_e)   per envelope, clamped
    Unbudgeted = spendable − Σ held_e

**The clamp is load-bearing, not cosmetic.** It encodes: net worth W = Unbudgeted + Σ held,
and you cannot physically hold negative cash. Overspent cash already left the accounts, so
`spendable` already dropped. Removing the clamp (making held signed) credits the already-gone
overspend back into the pool → Unbudgeted > W, which is impossible for a free-cash pool. The
"first fix attempt removed GREATEST" change is therefore WRONG; revert-and-keep-clamp is correct.

**Verified numerically on the cloned DB (Family Budget space, 2026-06):**
- spendable W = 174,688.21; Σ held (clamped) = 31,359.91; Σ signed remaining = 24,484.91
- Unbudgeted (clamp)   = 143,328.30  ≤ W  ✓
- Unbudgeted (no clamp)= 150,203.30  (credits back 6,875.00 of overspend — the bug)

**Corollary (surprising but correct):** allocating into an ALREADY-overspent envelope leaves
Unbudgeted UNCHANGED while the envelope stays net-overspent, because spendable doesn't move
(allocation transfers no cash) and held stays clamped at 0 until allocation exceeds consumption.
Only the portion of an allocation that pushes held above 0 reduces Unbudgeted. This is the
"605.49 stays at 605.49 even though the card's overspend shrank" scenario — it is correct.

See [[simplified-budgeting-model]].
