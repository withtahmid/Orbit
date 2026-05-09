---
name: Three-mode carry_policy invariant
description: Envelope carry semantics: 'reset' = 0, 'positive_only' = max(0, prev_remaining), 'both' = signed prev_remaining.
type: project
---

Migration 035 replaced `carry_over: boolean` with `carry_policy text` (enum: 'reset' | 'positive_only' | 'both'). Both columns coexist for one release.

**Why:** Old boolean was asymmetric (true = surplus carries, debt forgotten). The new 'both' mode makes overspend an honest persisting obligation.

**How to apply:** Whenever reviewing analytics or balance SQL, the carry_in calculation MUST follow this CASE:
```sql
CASE
  WHEN cadence = 'none' OR carry_policy = 'reset' THEN 0
  WHEN carry_policy = 'both' THEN prev_alloc - prev_consumed
  ELSE GREATEST(0, prev_alloc - prev_consumed)
END
```
Any SQL that just looks at `carry_over` boolean is stale. Any SQL that gates with `carry_policy <> 'reset'` for prev_period CTEs and then re-applies the per-row CASE is correct.

Canonical implementation: apps/server/src/procedures/envelop/utils/resolveEnvelopePeriodBalance.mts.

**Common bugs to look for:**
- Strict-mode gate or pending-reckoning queries that omit carry-in entirely → false positives.
- `consumed` computation that counts only `t.type='expense'` in one query but adds transfer fees in another → carry-in differs between Overview and Envelope detail.
- prev-period subqueries summing borrow rows (`borrowed_link_id IS NOT NULL`) into prev allocated → double-counts the −X half.
