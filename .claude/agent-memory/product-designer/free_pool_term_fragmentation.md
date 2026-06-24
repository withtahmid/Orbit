---
name: free-pool-term-fragmentation
description: One free-cash pool number is labeled 5 different ways across budgets/overview/analytics surfaces; held is "Held in envelopes" only in AllocationsView.
metadata:
  type: project
---

The single free-cash number (`summary.unallocated` = spendable − Σmax(0, allocated−consumed)) is surfaced under many names across the app — a recurring product-consistency hazard. As of 2026-06-24 (budget-bug-fix branch):

- BudgetsPage `UnbudgetedBanner` → **"Unbudgeted"** / "Over-budgeted by"
- OverviewPage StatTile (line ~591) → **"Unallocated"**, delta "Free to allocate"
- OverviewPage allocation donut (line ~326) → **"Unallocated"** slice
- AllocationsView → **"Free"** (partition) + **"Free to budget"** (KPI sub) + **"Committed"** (raw Σallocated, a 5th budget-intent word)
- BudgetMonthPage → **"Free after save"**, sub "still unbudgeted"

Held pool (clamped `envelopeRemaining`) is labeled **"Held in envelopes"** ONLY in AllocationsView (renamed from "Earmarked"); BudgetsPage env card shows the gross "Allocated" instead.

**Why:** The budget-bug-fix PR fixed the *math* and per-surface overspend messaging but left the pool without a stable public noun. "Earmarked" was removed from UI but still lives in DocsPage:300,424.

**How to apply:** When reviewing or planning any budgeting copy, push for ONE user-facing noun for the free pool (recommend "Unbudgeted") and keep "Held in envelopes" for held. Treat DocsPage as the canonical glossary that must define Allocated vs Held vs Unbudgeted. See [[personal_space_unallocated_misframe]], [[docs_page_stale_after_merge]].
