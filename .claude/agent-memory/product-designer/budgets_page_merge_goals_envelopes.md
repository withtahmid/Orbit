---
name: budgets-page-merge-goals-envelopes
description: Design direction (2026-05-14) — merge Plans/Goals page into the Envelopes page as a unified "Budgets" page with two sections (Expenses, Goals) and an allocation-bar reconciliation widget at the top.
metadata:
  type: project
---

Recommended product direction for Orbit's allocation surface, agreed in design review on 2026-05-14:

- **One page, two sections.** Replace separate `/envelopes` and `/plans` pages with a unified `/budgets` page. Top section: expense envelopes (cadence-based, rolling). Bottom section: goal envelopes (formerly plans, no cadence, target-based). User allocates in both places without page-switching.
- **Page is "Budgets", entity stays "Envelope".** Do NOT rename the `envelops` table or procedures. The *page* surfaces as "Budgets"; internally an Envelope is still an Envelope and a Goal is still a Goal. Same pattern YNAB uses (Budget = page, Category = bucket).
- **Reconciliation bar at the top.** Single horizontal stacked bar showing `envelope_held + plan_held + free = spendable` (locked accounts excluded). This is the invariant the user explicitly wants visible so they can mentally reconcile that all money has a job. Data already exists in `resolveSpaceUnallocated`.

**Why:** The user's reconciliation invariant `(money in goals) + (money in envelopes) + (free to allocate) = asset money` is one mental model, not two. Splitting onto separate pages hides the trade-off ("top up Emergency Fund vs Groceries"). PlansPage and EnvelopesPage are already parallel CRUDs with duplicated styling/dialogs (~1200 lines each) — merging removes structural duplication.

**How to apply:**
- Ship the rename plan→goal first (mechanical), then merge to `/budgets` in a follow-up PR (UI work). Don't bundle these.
- The reconciliation bar should be a single component fed by one analytics procedure that returns `{spendable, envelopeHeld, goalHeld, free}`. Mirror this on `/s/me` (personal space twin).
- Resist any future request to rename "Envelope" → "Budget" or "Category" — the ripple into `envelop_allocations`, `expense_categories.envelop_id`, Reckoning, and pin docs is huge and the page-level rename solves the user-visible problem.

See also [[plan-rename-to-goal]] and [[liability-budgeting-treatment]].
