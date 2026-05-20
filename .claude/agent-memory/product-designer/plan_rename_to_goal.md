---
name: plan-rename-to-goal
description: The `plan` entity is being renamed to `goal` (rolling savings goal envelope); the separate "monthly envelope plan page" (PlanMonthPage at /s/:id/plan/:month) is a different thing and stays.
metadata:
  type: project
---

The `plan` entity (long-horizon savings goal — `plans` table, `plan_allocations`, `analytics.planProgress`, `pages/space/plans/`) is being renamed to **goal**. This was a naming mistake the project owner wants to fix.

**Why:** "Plan" was the wrong word for what is conceptually a rolling, target-amount savings envelope (Emergency Fund, Japan Trip). "Goal" is what users actually call it. The current name also collides linguistically with the unrelated "monthly envelope plan page."

**How to apply:**
- Two distinct surfaces share the "plan" word — don't conflate:
  - **Entity to rename:** `procedures/plan/*`, `routers/plan.mts`, `plans` + `plan_allocations` tables, `analytics.planProgress` (+ personal twin `personal/planProgress.mts`), `pages/space/plans/`, `ROUTES.spacePlans`/`spacePlanDetail`, `PlanAllocateDialog`. This is the long-horizon goal entity.
  - **Keep (but consider future rename):** `pages/space/plan/PlanMonthPage.tsx` at route `/s/:id/plan/:month` (`ROUTES.spacePlanMonth`). This is the *monthly budget* view over envelopes — uses `analytics.envelopeUtilization`, not `plan.*` procedures. Eventually rename to "Monthly budget" / `/s/:id/budget/:month` in a separate follow-up.
- The personal-space twin `personal/planProgress.mts` exists and must be renamed in lockstep.
- Tricky spot: SQL alias `plan_held` inside `resolveSpaceUnallocated.mts` and its comment header.
- No naming collisions elsewhere — "plan" is not used for subscription/billing concepts in Orbit.

See also [[budgets-page-merge-goals-envelopes]] and [[liability-budgeting-treatment]].
