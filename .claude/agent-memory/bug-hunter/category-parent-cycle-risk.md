---
name: category-parent-cycle-risk
description: expense_categories.parent_id has no DB-level or app-level cycle protection beyond self-parent; any new WITH RECURSIVE traversal can spin until statement_timeout
type: project
---

`expense_categories.parent_id` is a self-FK with ON DELETE RESTRICT but **no cycle prevention**.

- DB: migration `0012_create_expense_categories_table.mts` defines the FK only.
- App: `procedures/expenseCategory/changeParent.mts` blocks `parent === self` but does **not** walk the ancestor chain to reject e.g. A→B, then B→A.

**Why:** Pre-existing latent issue — until recently no readers used `WITH RECURSIVE` on this table, so a cycle would only break the UI, not DoS the DB.

**How to apply:** When reviewing a change that introduces a recursive CTE over `expense_categories` (e.g. analytics `trendsCategoryMovers`, `trendsFilters.selected_categories`, `child_of_root`), call out the cycle risk. The CTEs use `UNION ALL` (no cycle dedup), so an owner-crafted A↔B cycle hangs the query until `statement_timeout`. Either add `WHERE NOT (id = ANY(path))` cycle guards to the CTE, or fix `changeParent` to walk the ancestor chain.
