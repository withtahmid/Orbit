---
name: Envelope total denominator
description: Canonical formula for envelope utilization percentage
type: project
---

Every envelope row from `analytics.envelopeUtilization` returns three relevant fields: `allocated`, `carryIn`, `consumed`. The envelope's total budget for the period is `allocated + carryIn`, and the percent-used is `consumed / (allocated + carryIn) * 100`.

**Why:** carryIn folds in the prior period's surplus (per the envelope's `carry_policy`: reset / positive_only / both). Treating only `allocated` as the denominator under-uses carry-over and over-states urgency for envelopes that carried forward.

**How to apply:**
- Any percent-used / sort-by-urgency / "spent of plan" calc should use `allocated + carryIn` as denominator.
- "Over by" should be `max(0, consumed − (allocated + carryIn))`.
- As of branch `wrap`, `EnvelopesPage.tsx` urgency sort passes `allocated + carryIn` into `pctOf` (lines 92–94) — the earlier drift was fixed. The header KPI uses `totals.consumed / totals.allocated` where `totals.allocated = Σ(allocated + carryIn)` (line 200), so it's correct despite the label saying "% of allocated".
