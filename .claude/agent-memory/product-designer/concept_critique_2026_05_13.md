---
name: concept-critique-2026-05-13
description: Product-concept verdict after multi-pass session — envelope/plan/reckoning are conceptually muddled, not just dirty; missing primitive is a unified envelope-ledger with typed kinds.
metadata:
  type: project
---

Product-shape verdict reached on 2026-05-13, after a session of tactical patches (drain bars, period-vs-lifetime cue, retroactive allocation, plan-page entry, allocation-map deletion, etc.) culminated in the user pushing back: "do not plan around one issue I have given. think for the product."

**Verdict:** Model is fundamentally muddled, not just dirty. The data shape is honest; the *concepts* layered on top do 1.5 jobs each.

Core findings:
- **Envelope** today conflates (a) category of intent, (b) funding rule (cadence + carry policy), (c) scoreboard. Same row used for "perpetual buffer," "monthly limit," and "time-bound goal" — semantics of `remaining` differ but render identically.
- **Plan** is an envelope with `target_amount`/`target_date` and no cadence. Has parallel everything: `plans` table, `plan_allocations` table, own list/detail pages, own analytics family (`planProgress` vs `envelopeUtilization`), own allocate dialog. Two ledgers, one job.
- **Allocation** is the only honest primitive — signed money-movement, optional `period_start`.
- **Reckoning** is not a concept; it's a patch for a missing one. Migration 036 even admits "the resolution itself is performed via the existing transfer / borrow / no-op procedures; this table just records the *acknowledgment*."
- **Borrow** is two signed allocations with a `borrowed_link_id`. The fact it needed bespoke procedure/UI/undo is a smell.

Two consequential model issues:
1. **Over-modelled:** Plan is a parallel universe of Envelope. Target is a property, not a type.
2. **Under-modelled:** Envelope has no lifecycle/identity over time. Rename, re-cadence, split, merge, archive-and-recreate silently rewrite history because analytics read today's `cadence`/`carry_policy` and apply to past periods. `archived` is a tombstone, not a lifecycle event.

Missing primitive: **a typed envelope-ledger** — every change (allocate, deallocate, borrow, cover, reckon, restructure-rename, restructure-cadence-change, archive) is a row with `kind`, `effective_at`, `created_at`. The envelope row becomes a cached projection of its ledger. Reckoning becomes a row, not a banner. Restructure becomes a row, not a silent rewrite.

Highest-leverage fixes proposed (NOT yet greenlit by the user):
1. Collapse Plan into Envelope (add `target_amount`/`target_date` to envelopes, retire `plans`/`plan_allocations`).
2. Promote the envelope ledger to first class with `kind` + `effective_at`; current `envelop_allocations` rows become `kind='allocate'`.

**Why:** The user's trust is the failure mode ("the errors are fucking me now"). Numbers a user can't trust are worse than numbers they can't see. Surface-level fixes were stacking up because each one reconciled disagreement between concepts that should not have disagreed.

**How to apply:** Future planning passes for budgeting/envelopes/plans/reckoning should evaluate proposals against this: does it move toward "one envelope, one typed ledger, history-as-events" or does it add another bespoke surface to reconcile? If the latter, push back on the framing first.

Related: [[envelope-category-coupling-decision]], [[rolling-envelope-lifetime-semantics]], [[carry-both-absorb-gap-anomaly]].
