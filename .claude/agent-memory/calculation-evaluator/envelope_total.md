---
name: Envelope total denominator
description: Canonical formula for envelope utilization percentage
type: project
---

Every envelope row from `analytics.envelopeUtilization` returns three relevant fields: `allocated`, `carryIn`, `consumed`. The envelope's total budget for the period is `allocated + carryIn`, and the percent-used is `consumed / (allocated + carryIn) * 100`.

**Why:** carryIn folds in the prior period's surplus (per the envelope's `carry_policy`: reset / positive_only / both). Treating only `allocated` as the denominator under-uses carry-over and over-states urgency for envelopes that carried forward.

**How to apply:**
- Any percent-used / sort-by-urgency / "spent of plan" calc should use `allocated + carryIn` as denominator.
- Currently `EnvelopesPage.tsx` `pctOf(consumed, allocated)` (line ~79) sorts only by `consumed/allocated`. This is a drift from the displayed percentages, which all use `consumed/(allocated+carryIn)`. Flag this pattern.
- "Over by" should be `max(0, consumed − (allocated + carryIn))`.
