---
name: analytics-categories-classification-only
description: "Spending by category" analytics page is classification-only; envelopes must not be a donut level. Envelope nav links from /s/me break because virtual space owns no envelopes.
metadata:
  type: project
---

The `/s/:spaceId/analytics/categories` donut (CategoriesView.tsx) must drill the CATEGORY tree only (root categories → sub-categories → leaf→transactions). Envelopes are NOT a drill level. Owner decision (2026-06-02): "the donut is supposed to show categories and not involve envelopes."

**Why:** Canonical separation in this repo — envelopes = budgeting (allocation/limit), categories = classification (what a txn was). A page titled "Spending by category" answering a budgeting question (envelope-level top slices) duplicated what Budgets page / EnvelopesView / OverviewPage allocation bar already do. Envelopes were only ever a synthesized pseudo-level (`ENVELOPE_ID_PREFIX`) bolted onto `categoryBreakdown`, whose data is built around the category `parent_id`/`root` tree.

**How to apply:**
- Keep envelope name as a read-only SUBTITLE on ranked rows (classification context, like account-name under a txn) — that's fine.
- Do NOT add envelope navigation affordances (e.g. "Open envelope" buttons/links) to this page. They re-introduce the budgeting jump-off the owner removed, and tend to be inconsistent (only leaves get them).
- PERSONAL-SPACE TRAP: in `/s/me`, envelope ids come from `personal.envelopeUtilization` and belong to the user's *underlying member spaces*. `/s/me` is virtual and owns NO envelopes. `ROUTES.spaceBudgetDetail("me", envId)` → `/s/me/budgets/<foreignEnvId>` mounts BudgetDetailPage in the personal context and dies at the data layer (route is registered generically under `/s/:spaceId`). Any envelope link from a personal-space view must resolve the OWNING space (see EnvelopesView.tsx pattern `spaceIdForLink`), not blindly use `space.id`. Cousin of [[personal_space_unallocated_misframe]].
