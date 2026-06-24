---
name: personal-held-asymmetry
description: personal/summary.mts computes envelope held with space-wide allocated but owner-only consumed, which can overstate held and understate personal Unbudgeted when a co-member spends.
metadata:
  type: project
---

`personal/summary.mts` envelope held has a structural asymmetry vs `analytics/spaceSummary.mts`:

- `p_allocated` = the envelope's FULL space-wide allocation (no per-owner scoping; allocations
  have no account dimension).
- `p_consumed`  = only expenses whose `source_account_id = ANY(owned)` — the caller's slice.
- `held = GREATEST(0, full_allocated − my_consumed)`.

When a co-member spends from a non-owned account, that consumption is invisible to the personal
held, so held is overstated and personal Unbudgeted (spendable − Σheld) is understated. The
personal `spendable` is owner-account-only, so the W = Unbudgeted + Σheld identity is no longer
clean for the personal view — held is measured against a wider allocation base than the personal
spendable it's subtracted from.

**Dormant in the current seed:** every envelope expense in alex's member spaces happens to come
from alex's owned accounts (consumed_owned == consumed_all == 27,210.09), so the bug doesn't fire
in the cloned data. It WILL fire in production for any shared space where another member spends
(Family Budget has 4 members). This is a SEPARATE issue from the clamp revert — flag it but don't
conflate. Product must decide what "my held" means: either scope allocated to the owner's
contribution too, or accept that personal held mixes a space-wide numerator with an owner
denominator. Not blocking the clamp revert.

See [[unbudgeted-cash-identity]].
