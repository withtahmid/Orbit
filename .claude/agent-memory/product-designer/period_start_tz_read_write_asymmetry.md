---
name: period-start-tz-read-write-asymmetry
description: envelop_allocations.period_start tz drift — write side hardened with literal string, read side (spaceSummary) still session-tz dependent
metadata:
  type: project
---

`envelop_allocations.period_start` is a tz-less `date`. Writing an APP_TZ month-start *instant* (`…T18:00Z` for Asia/Dhaka) and casting `::date` truncates in the DB **session tz**; under GMT (Neon pooler drops post-connect `SET TIME ZONE`) it drifts to the previous day/month. Migration 049 repairs drifted rows (merge-by-sum into same-month sibling — correct given the accumulate-delta UPSERT model).

Two-sided fix, applied unevenly as of branch `budget-bug-fix-2` (2026-07-01):
- WRITE path hardened: `appTzMonthStartString(at)` in `periodWindow.mts` emits a literal `YYYY-MM-01` string, session-tz-independent. Used by `createAllocation` + `allocation/transfer`.
- READ path NOT hardened: `spaceSummary.mts` interpolates `${input.periodStart}::date` where periodStart is a `z.coerce.date()` instant → reintroduces the same session-tz `::date` drift. Also `resolveSpaceUnallocated.mts` + `personal/summary.mts` still use `DATE_TRUNC('month', NOW())`.

**Why:** the whole budget path's month-matching correctness now rests on the `options: -c timezone=` startup param holding — the mechanism the code itself calls historically flaky.
**How to apply:** whenever comparing against `period_start`, insist on a literal `YYYY-MM-01` string on BOTH sides. Flag any raw-`Date`-instant `::date` cast in budget queries as reintroduced drift.
