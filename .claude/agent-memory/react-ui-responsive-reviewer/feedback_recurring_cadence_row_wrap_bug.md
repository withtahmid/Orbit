---
name: feedback-recurring-cadence-row-wrap-bug
description: Envelope card cadence rows tend to be non-wrapping spans; flag any new content appended there
metadata:
  type: feedback
---

The envelope card/list cadence rows live in `apps/web/src/pages/space/budgets/BudgetsPage.tsx` (NOT the old `envelopes/EnvelopesPage.tsx`, which was removed — the Envelopes feature was renamed to Budgets). The card cadence container `.env-card-cadence` HAS been fixed to `display:flex; flex-wrap:wrap; column-gap:4px; row-gap:2px` and uses `<span aria-hidden>·</span>` structural separators — good. BUT the **list-row** equivalent `.env-list-row-cadence` is still a plain non-wrapping element with literal `·`/`net −X` text separators (around line 1017-1055), and the segments include inline `<Money>` that cannot break. Adding a 3rd segment (goal date + drift + lifetime overrun simultaneously) can overflow the narrow list column.

**Why:** Repeatedly catching this pattern across reviews — drift suffix, lifetime-overrun suffix, etc. each added without making the row wrappable.

**How to apply:** When reviewing additions to envelope cadence rows, check BOTH `.env-card-cadence` (already wrappable) and `.env-list-row-cadence` (still not). Recommend giving the list-row cadence the same `flex-wrap: wrap` treatment with structural separators.
