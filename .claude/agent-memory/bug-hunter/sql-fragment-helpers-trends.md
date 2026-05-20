---
name: sql-fragment-helpers-trends
description: Spending Trends shares a sql-fragment helper module — review checklist when touching it or any trends proc
type: project
---

`apps/server/src/procedures/analytics/utils/trendsFilters.mts` exports `sql\`\``-fragment helpers that get spliced into 6 trends procedures (3 space + 3 personal).

**Invariants to verify on any change:**

1. Every interpolation inside the helpers is parameterized via the tagged template — never `sql.raw` of anything that could carry user input. Today the only `sql.raw` callsites in trends procs are interval literals derived from a Zod enum (`GRANULARITY_CONFIG`), so they're safe.
2. `selectedCategoriesCTEClause` returns either `sql\`\`` or `sql\`selected_categories AS (...),\`` — note the trailing comma. Callers splice as `WITH RECURSIVE ${clause} next_cte AS (...)`. Postgres accepts `WITH RECURSIVE` even when no actual recursive CTE follows.
3. The recursive CTEs for category descendants have **no cycle guard** (`UNION ALL`, not `UNION`). See [[category-parent-cycle-risk]].
4. `intersectAccountIds` returns `[]` when narrowed to non-owned ids. Every personal-twin caller MUST short-circuit on `owned.length === 0` before issuing SQL — because otherwise a query containing `OR destination_account_id = ANY('{}'::uuid[])` evaluates to false on that branch but the empty-source-account branch still permits OR matches via destination. (Checked at write time: `personalTrendsCategoryMovers`, `personalTrendsDailyComparison`, `personalTrendsYearOverYear` all short-circuit correctly.)

**How to apply:** Any new trends procedure or filter dimension should be added by extending `trendsFilters.mts` and reusing the helpers — don't open-code the fragments in the proc.
