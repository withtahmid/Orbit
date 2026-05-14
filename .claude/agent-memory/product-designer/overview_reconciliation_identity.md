---
name: overview-reconciliation-identity
description: The canonical reconciliation identity that the Overview should surface, and why the user's verbatim version is a simplification.
metadata:
  type: project
---

The canonical "where each dollar lives" identity in Orbit is from spec §5.3
(`contexts/project-specification.md:415-420`) and is implemented in
`analytics.spaceSummary` and `personal.summary`:

```
Net worth      = Spendable + Locked
Spendable      = envelopeRemaining + planAllocated + Unbudgeted
isOverAllocated = Unbudgeted < 0
```

`Unbudgeted` is the user's preferred label for what the API calls
`unallocated` and the Overview today calls "Unallocated". The Envelopes-page
banner already uses "Unbudgeted" (`EnvelopesPage.tsx:1061`); align the
Overview to that label.

**Why:** When the user asked for `Remaining + Unbudgeted == Net worth` they
were stating the simplified case (no locked, no plans). The reconciliation
bar must show the FULL identity (4 segments: Envelopes / Plans / Unbudgeted
/ Locked) so the over-allocated state and the locked-money gap are both
visible. Hiding Plans or Locked makes the bar lie when those slots are
non-zero.

**How to apply:** Any future Overview-page work or new analytics tile that
references "free", "unbudgeted", "unallocated", or "money to budget" must
reconcile against this 4-slot identity. If a UI surface drops a slot to
look cleaner, it must do so via a tooltip/expander, not by silently rolling
the dropped slot into another segment.
