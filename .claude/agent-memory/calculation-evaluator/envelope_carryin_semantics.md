---
name: envelope-carryin-semantics
description: What `allocated`, `carryIn`, and `remaining` mean on EnvRow (analytics.envelopeUtilization output) — and which sum maps to which UI concept.
type: project
---

For rows returned by `analytics.envelopeUtilization` (server: `apps/server/src/procedures/analytics/envelopeUtilization.mts`):

- `e.allocated` = sum of `envelop_allocations.amount` whose effective `period_start` falls inside the requested window. For the period being viewed, this is "what the user (or system) explicitly put into the envelope this period."
- `e.carryIn` = previous-period remainder propagated under the envelope's `carry_policy`:
  - `reset` → 0
  - `positive_only` → `max(0, prev_alloc − prev_consumed)`
  - `both` → `prev_alloc − prev_consumed` (signed; debt persists)
  - `cadence='none'` envelopes always have carryIn = 0.
- `e.remaining` = `carryIn + allocated − consumed` (the "still available to spend" pool).

**Mapping to UI concepts** (verified against `resolveEnvelopePeriodBalance.mts`):
- "Planned"/"Budgeted *this period* by user" = `allocated` alone.
- "Budget" / "Pool" / "Spendable this period" = `allocated + carryIn`.
- "Spent this period" = `consumed`.
- "Unspent vs. budget" / "Under/Over plan" = `remaining` = `(allocated + carryIn) − consumed`.

**Why:** The Plan-month "Was planned" label originally summed `allocated + carryIn`, but that's the pool, not the plan. Conflating them double-counts last period's surplus as "this period's plan." The companion "Under/Over plan" stat that uses `Σ remaining` is only consistent if the paired number is the pool, not the plain allocation.

**How to apply:** When auditing any UI that displays an envelope total: ask whether the intent is "what the user committed to spend this period" (→ `allocated`) or "what's available to spend" (→ `allocated + carryIn`). The "Under/Over plan" companion stat only balances against the pool, so labels and arithmetic must agree on which one is showing.

Related: [[apptz-month-helpers]]
