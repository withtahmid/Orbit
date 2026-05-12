---
name: envelope-category-coupling-decision
description: Product judgment on Orbit's envelope↔category coupling — strict N:1 conflicts with spec's stated orthogonality; recommended path is soft-decouple via transactions.envelop_id.
metadata:
  type: project
---

The envelope↔category coupling in Orbit is a known design tension as of 2026-05-12 (branch `rethink-budgeting`). The schema enforces `expense_categories.envelop_id NOT NULL REFERENCES envelops` with a "subtree invariant" (all descendants share parent's envelope), but the spec at §1 describes envelopes (funding/cadence) and categories (taxonomy/priority) as orthogonal — Monarch-lane, not YNAB-lane. Implementation is YNAB-lane wearing two hats.

**Why:** The coupling exists so the legacy trigger (migration 019, retired in 026) and on-read balance resolution can compute `tx → envelope` via the join. It buys join simplicity at the cost of: (1) categories pinned to one envelope, (2) subtree reorganization traps, (3) no "uncategorized" expense flow, (4) historic balances don't follow `changeEnvelop` rewrites, (5) `expenseCategory.delete` is unguarded and 500s on FK violation.

**How to apply:** When asked about budgeting/categorization features on this branch or future work, recommend Option A (soft decouple): add `transactions.envelop_id` as the canonical join, make `expense_categories.envelop_id` nullable + advisory, default from category at write time, allow per-transaction override. Defer Option B (full M:N split-transactions) until A ships. Don't propose new features that lean harder on the current strict coupling (e.g., per-envelope category locks, envelope-required category-tree imports) — they'll be torn out.

Related: [[events-domain-shape]].
