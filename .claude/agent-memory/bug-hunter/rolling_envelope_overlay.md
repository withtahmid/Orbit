---
name: rolling-envelope-overlay
description: spaceSummary's MAX(lifetime, period) remaining for cadence='none' envelopes is directional — masks current-period overspend when lifetime is healthy.
metadata:
  type: project
---

`apps/server/src/procedures/analytics/spaceSummary.mts` (≈L164-176) computes envelope `remaining` for `cadence='none'` as:

```
GREATEST( GREATEST(0, p_allocated - p_consumed), GREATEST(0, overlay_allocated - overlay_consumed) )
```

**Why:** introduced 2026-05-13 to fix the case where a *lifetime* deficit swallows fresh in-period surplus into Unbudgeted. The MAX picks whichever (lifetime or selected period) shows more remaining.

**How to apply:** any time you touch this block, re-check the directional contract:
- **Lifetime healthy + period overspend** → `remaining` reflects lifetime; current-month overspend is invisible in `unallocated`. This is intentional today (rolling envelopes are lifetime-scoped) but is worth re-confirming whenever the rolling-envelope semantics shift.
- The overlay window is `input.periodStart`/`input.periodEnd`. A single-day or year-wide window degenerates predictably (single-day → near zero, year → matches lifetime). MAX keeps the result safe in both directions.
- Don't confuse `allocated` / `consumed` (still lifetime-scoped for rolling) with `remaining` (now the dual-clamped MAX). Web consumers reading just `envelopeRemaining` see the new shape; consumers reading `envelopeAllocated`/`envelopeConsumed` still see lifetime.

Related: [[allocation-period-start-null]] — overlay's `period_start` coalesce uses `created_at` for rolling envelopes since those rows always store NULL.
