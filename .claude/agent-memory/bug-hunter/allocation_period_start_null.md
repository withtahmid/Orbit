---
name: allocation-period-start-null
description: Allocations for cadence='none' envelopes store period_start=NULL; SQL readers must COALESCE to created_at-derived date.
metadata:
  type: project
---

`apps/server/src/procedures/envelop/createAllocation.mts` (≈L116-119) stores `period_start = NULL` when the envelope's cadence is `'none'`. Borrow legs in `borrowFromNextMonth.mts` (L103, L121) set explicit UTC month boundaries.

**How to apply:** when writing SQL that filters `envelop_allocations` by period, always use the project-standard fallback:

```sql
COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date)
```

Dropping the COALESCE silently excludes every rolling-envelope allocation from period-windowed totals.
