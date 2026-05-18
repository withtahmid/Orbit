---
name: plan-envelope-merge-decision
description: Decision on 2026-05-14 to drop the plans table and fold goals into envelopes as cadence='none' + optional target_amount/target_date — no new discriminator enum.
metadata:
  type: project
---

User chose to **drop `plans` entirely** and represent goals as envelopes with `cadence='none'` plus optional `target_amount` / `target_date`. Discriminator is implicit (`target_amount IS NOT NULL`), not a new `kind` enum. This supersedes the earlier "rename plan → goal as a separate table" plan from [[plan_rename_to_goal]] and [[budgets_page_merge_goals_envelopes]].

**Why:** maximum-simplification preference. The two systems were already 80% congruent — migration 026 had retired plan_balances/envelop_balances triggers in favor of on-read aggregation, so there was no trigger asymmetry to port. `cadence='none'` envelopes already behave as lifetime/rolling buckets. The merge loses no information; the category "plan" was just convention.

**How to apply:**
- When user discusses "goals" / "plans" / "budgets," treat them as one entity. Filter by `target_amount IS NOT NULL && cadence='none'` for the Goals UI section; the rest are Budgets.
- New envelope-create form has a three-way `Goal | Monthly | Rolling` toggle gating target/cadence/carry fields.
- A monthly envelope WITH a target is allowed (no constraint); it's just a "monthly cap with progress bar" combo.
- `analytics.planProgress`, `personal.planProgress`, and the `plan.*` router are dropped — fields fold into `envelopeUtilization` (add `targetAmount`, `targetDate`, `pctComplete`, `firstAllocatedAt`, `lastAllocatedAt` to its output).
- `spaceSummary.planAllocated` field is dropped; `unallocated = spendable − envelopeRemaining`.
- `allocation.transfer`'s discriminated union collapses to envelope-only.
- Single PR, single migration (`046_merge_plans_into_envelops`), one round of procedure + web edits — must land atomically because `plan_allocations` table is dropped at the end of the migration.
- Reuse `plans.id` as the new `envelops.id` so child rows don't need rewriting; guard with a pre-merge collision check (mirror of migration 041's orphan check).
