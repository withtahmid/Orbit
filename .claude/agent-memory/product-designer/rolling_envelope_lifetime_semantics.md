---
name: rolling-envelope-lifetime-semantics
description: Rolling envelopes (cadence='none') use lifetime-scoped numbers everywhere; period-scoped concepts (carry, borrow, "this period") only apply to monthly envelopes.
metadata:
  type: project
---

For `envelops.cadence = 'none'`: `consumed`, `remaining`, and bar drains MUST be computed over all time. `periodStart`/`periodEnd` inputs to `analytics.envelopeUtilization` are silently ignored for rolling rows. `carryIn`, `borrowedIn`, `borrowedOut` are always 0 on rolling envelopes. `remaining` is signed (negative = overspent).

**Why:** A rolling envelope is a single ever-open pool; period-slicing produced contradictions like "+14 left this month / net overspent 19,986 lifetime" on the same card (user reported on 2026-05-13). The two-narrative bug was fixed by removing the period frame from rolling envelopes entirely, not by adding more pills. The earlier `lifetimeOverrun` field was deleted from the procedure output as part of this fix — it was a duplicate signal once `remaining` carried the sign.

**How to apply:**
- Any new UI consuming `envelopeUtilization` for rolling envelopes must use sign-aware labels ("X left" vs "X overspent") on `Math.abs(remaining)`.
- Hide period-only chips (carry policy, borrow-in/out, "spent this period") behind a `cadence === 'monthly'` gate.
- PlanMonthPage stays monthly-only; rolling envelopes never appear in the planning ritual.
- ReckoningPage / TopUp / Move candidate lists keep their `remaining > 0` filter — overspent rolling envelopes correctly drop out as pull sources / settle suggestions.
- If a future feature needs lifetime-overrun specifically, compute `Math.max(0, -remaining)` in the client; don't re-add a server field.

Related: [[envelope-category-coupling-decision]], [[carry-both-absorb-gap-anomaly]].
