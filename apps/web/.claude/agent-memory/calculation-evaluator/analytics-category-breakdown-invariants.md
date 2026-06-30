---
name: analytics-category-breakdown-invariants
description: Subtree/direct-total aggregation invariants and trends-filter semantics for analytics categoryBreakdown + spendingHeatmap (server + web CategoriesView).
metadata:
  type: project
---

Verified invariants for the analytics category/heatmap feature (server `procedures/analytics/{categoryBreakdown,spendingHeatmap}.mts`, `procedures/personal/*`, web `pages/space/analytics/views/CategoriesView.tsx`).

**Subtree aggregation.** The `tree` recursive CTE seeds EVERY category as its own root (base case `id AS root`) and propagates ancestor `root` down. So `subtreeTotal(ec) = Σ directTotal over {ec + all descendants}`. Filtering only touches `spending_rows`/`spends`; the tree structure is unfiltered, so parent.subtree = parent.direct + Σ children.subtree holds even under envelope/account/category filters.

**Grand-total identity (web flat mode).** `Σ directTotal(all categories) == Σ subtreeTotal(root categories)` holds because every tagged expense contributes to exactly one category's directTotal, and every category reaches a parentId=null root via a finite acyclic chain. **Why:** `changeParent.mts` only blocks self-parent + enforces same-space parent; it does NOT block multi-node cycles. A cycle is the only way to break the chain — but a cycle makes the unguarded main `tree` CTE recurse to statement-timeout (crash), so it can't silently miscount. The identity is safe under valid data.
**How to apply:** the donut center (`rootTotal` = Σ root subtreeTotal) and the flat KPI "Total spent" (Σ directTotal) are the same number. momDelta compares Σdirect(curr) vs Σ-root-subtree(prev) — same basis, both period grand totals. No basis mismatch.

**Trends filter semantics (trendsFilters.mts).** envelope filter `t.envelop_id = ANY(ids)` drops NULL-envelope rows; category filter `t.expense_category_id IN (selected_categories subtree)` drops NULL-category rows. In spendingHeatmap, BOTH filters are applied to the transfer branch too — transfer principal rows always have envelop_id IS NULL and expense_category_id IS NULL (verified in transfer.mts: only the separate fee row, type='expense', carries them). So ANY envelope OR category filter zeroes the transfer branch. This is intentional/consistent with "only tagged transactions" semantics, though the code comment only documents the category case.

**Personal empty-intersection.** `intersectAccountIds(owned, accountIds)` returns `[]` when the filter excludes all owned accounts. personal/categoryBreakdown runs the query (`source_account_id = ANY('{}')` → all-zero categories); personal/spendingHeatmap short-circuits to `[]`. Both correct and equivalent — neither has a `destination_account_id` OR clause, so the trendsFilters.mts `[]` warning (about OR'd dest predicates leaking rows) does not bite here.

**WITH RECURSIVE + empty CTE.** When no category filter, `selectedCategoriesCTEClause` returns empty and the query is `WITH RECURSIVE scope_accounts AS (...)` with no recursive member — valid Postgres (RECURSIVE permits non-recursive members). `selected_categories` is referenced only when the CTE is present (categoryFilterWhere is empty in lockstep). No dangling reference.
