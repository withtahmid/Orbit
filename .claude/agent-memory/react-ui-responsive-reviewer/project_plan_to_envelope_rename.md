---
name: project_plan_to_envelope_rename
description: rename-plan-goal branch merges legacy "Plans" into envelopes (target_amount/target_date on envelope) but leaves user-facing "Plan" copy in BudgetMonthPage and OverviewPage
metadata:
  type: project
---

The legacy "Plans" feature was folded into envelopes: any envelope with `cadence === 'none'` may carry an optional `targetAmount`/`targetDate` and is then treated as a goal. New surfaces:

- `apps/web/src/pages/space/budgets/BudgetsPage.tsx` — renamed from `EnvelopesPage`; create/edit dialog adds Target amount + Target date fields when `cadence === 'none'`.
- `apps/web/src/pages/space/budgets/BudgetDetailPage.tsx` — adds a "Goal progress" card guarded by `envelope.targetAmount != null`.
- `apps/web/src/pages/space/budgets/BudgetMonthPage.tsx` — renamed from `PlanMonthPage` but internal classes (`plan-*`) and user-visible strings ("Plan {Month}", "Save plan", "Over plan", "Under plan") still say "Plan".
- `apps/web/src/pages/space/OverviewPage.tsx` — old Plans section replaced with a Goals card filtering `envelopeUtilization` by `targetAmount != null`; CTA button label is still "Plan {Month}".

**Why:** Single concept ("envelope") absorbs both monthly buckets and long-horizon savings goals. Avoids two parallel features.

**How to apply:** When reviewing this branch's UI, expect lingering "Plan" copy and visual identity gaps between goal envelopes and regular envelopes — `EnvelopeCard` does not yet differentiate. The grouped view on Budgets page splits by `cadence` only, not by goal-ness. Related: [[orbit-design-scoping]] (both pages wrap `.orbit-design`).
