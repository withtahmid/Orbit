---
name: migration-049-period-start-tz-fix
description: Migration 049 repairs tz-drifted envelop_allocations.period_start (day<>1 → last-day-of-prior-month); conservation proof + the date_trunc(+1 day) snap
metadata:
  type: project
---

Branch `budget-bug-fix-2` (2026-07). `envelop_allocations.period_start` (tz-less `date`) was written from an APP_TZ month-start INSTANT (`…T18:00Z`); under a GMT session `::date` truncated to the prior day (e.g. 2026-06-30 for the July bucket). Going-forward fix: writers now call `appTzMonthStartString(at)` (periodWindow.mts) which returns a literal `YYYY-MM-01` string stored verbatim. Session tz also now set via libpq startup `options` (`-c timezone=`), which survives PgBouncer/Neon pooler backend reassignment (post-connect `SET TIME ZONE` did not).

**Migration 049 (`up`) is 3 pure-date-arithmetic steps, all keyed on `EXTRACT(DAY FROM period_start) <> 1` = "corrupted".** Target month = `date_trunc('month', period_start + INTERVAL '1 day')::date`.
- Corrupted value is ALWAYS the last day of the prior month, so +1 day lands on the 1st of the intended month; `date_trunc('month', …)` makes it robust (handles Dec→Jan rollover: 2025-12-31 +1 = 2026-01-01, trunc = 2026-01-01). VERIFIED correct.
- Step 1 UPDATE: where a correct sibling row already exists at `target`, fold `amount = sibling + corrupted`. (No amount lost — additive.)
- Step 2 DELETE: remove the corrupted rows that had a sibling. (These were folded in step 1; deleting avoids double-count.)
- Step 3 UPDATE: shift remaining (no-sibling) corrupted rows' `period_start` to `target`. (Amount unchanged, just relabeled.)
- **Conservation holds** for both cases: (corrupted A + sibling B) → single row A+B; (corrupted only) → moved row keeps A. Total allocated per (envelope, true-month) is conserved. Idempotent (after run no day<>1 remains).

**Subtle non-defect in step 2 (self-join over ALL corrupted rows, not just step-1-merged):** DELETE removes any corrupted row that HAS a matching `good` sibling at target — regardless of whether step 1 folded THAT specific row. Because step 1 also folds every corrupted row with a sibling into the same `good` row, the set is identical, so no orphan-delete and no un-merged loss. Depends on: a corrupted row and its correct sibling can't both be day<>1 (correct sibling is day=1 by construction). Safe.

**LATENT edge (documented, not live):** if TWO corrupted rows mapped to the same target month AND no correct sibling existed, step 1 wouldn't fire (needs an existing day=1 sibling), step 2 wouldn't delete (no `good` row), step 3 would try to set BOTH to the same `period_start` → unique index `(envelop_id, period_start) NULLS NOT DISTINCT` violation. Cannot happen under the actual bug (the tz flip produces at most one prior-month-last-day bucket per month = one corrupted row per target), so not a real defect. Flag only if data shows >1 corrupted row per (envelope, target).

See [[simplified-budgeting-model]], [[apptz-month-helpers]].
