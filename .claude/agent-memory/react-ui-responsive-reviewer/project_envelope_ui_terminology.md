---
name: project-envelope-ui-terminology
description: Position vs Remaining naming on the envelope hero stat distinguishes cumulative from period-scoped semantics
metadata:
  type: project
---

The "Remaining" hero stat on `EnvelopeDetailPage` was renamed to "Position" to disambiguate cumulative/lifetime semantics from period-scoped "remaining" used elsewhere (envelope card, list row, analytics view all use "remaining" or "left of cap" for the *period* value).

**Why:** Same word was being used inconsistently across surfaces — the hero stat is fed by `envelope.remaining` (cumulative including carryIn/lifetime) while card/list `remaining` is `(allocated + max(0, carryIn)) - consumed` (period). The team wanted a clearly different word for the cumulative version.

**How to apply:** When reviewing envelope UI, do not suggest renaming "Position" back to "Remaining" without checking that the period vs cumulative distinction is preserved. If the label is unclear without the lifetime-overrun note (monthly envelopes get no note), suggest a clearer cumulative word like "Balance" or add a small "cumulative" eyebrow rather than reverting.

Related: [[project-envelope-lifetime-overrun-surfaces]]
