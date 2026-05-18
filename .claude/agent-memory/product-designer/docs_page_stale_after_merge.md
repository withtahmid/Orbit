---
name: docs-page-stale-after-merge
description: DocsPage Concepts grid still shows a "Plan" tile and Envelopes section omits target/goal copy after the plan->envelope merge.
metadata:
  type: project
---

After the plan/envelope merge (see [[plan-envelope-merge-decision]] and [[budgets-page-merge-goals-envelopes]]), DocsPage was only partially updated.

Outstanding stale areas as of 2026-05-15:
- Concepts ConceptCard for "Plan" remains as a sibling to "Envelope" (apps/web/src/pages/DocsPage.tsx:418), contradicting the merged model.
- Concepts intro paragraph still says "envelopes & plans" (line 300).
- Spaces section paragraph says "envelopes, plans, categories, and events" (line 493).
- LiveDemo blurb mentions "12 plans" (line 345).
- Envelopes function (line 576+) describes monthly/none cadence but never mentions the new `target_amount`/`target_date` capability and that goals live here now.
- Reference to "Plan this month" page (line 831, 839) — page is now "Budget this month".

**Why:** Docs are a stakeholder-facing surface and should be the source-of-truth for the mental model. The merge collapses Plan into Envelope; leaving a Plan concept card teaches a model that the product no longer supports.

**How to apply:** When auditing the rename branch before merge, treat DocsPage as a high-priority deliverable, not a polish item — the Concepts grid in particular is the page first-time visitors anchor on.
