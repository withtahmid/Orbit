---
name: period-start-write-read-asymmetry
description: period_start WRITE path now stores explicit 'YYYY-MM-01' APP_TZ string (drift-proof), but READ paths still bind a Date instant and cast ::date in session tz (drift-prone) — asymmetry.
metadata:
  type: project
---

As of migration 049 (branch budget-bug-fix-2), `envelop_allocations.period_start` WRITES were hardened against session-tz drift by storing an explicit `'YYYY-MM-01'` APP_TZ date string (`appTzMonthStartString` in `periodWindow.mts`), used by `createAllocation.mts` and `allocation/transfer.mts`.

BUT the READ paths were NOT changed and remain drift-prone whenever the pooled session falls back to GMT (the very failure the fix targets):
- `resolveEnvelopePeriodBalance.mts` `allocationPeriodMatch`: `a.period_start = ${start}::date` where `start` is a Date instant (`…T18:00Z` for Dhaka month-start). Casting a timestamptz to `::date` uses SESSION tz → 2026-06-30 under GMT, mismatching the correctly-stored `2026-07-01`.
- `spaceSummary.mts`: `${input.periodStart}::date` / `${input.periodEnd}::date` — web sends APP_TZ month-start INSTANTS (`startOfMonth` in `apps/web/src/lib/dates.ts` returns `…T18:00Z`). Same cast-in-session-tz drift.
- `envelopeUtilization.mts`: same `${periodStart}::date` / `${periodEnd}::date` binding of instants.
- `resolveSpaceUnallocated.mts`: uses `DATE_TRUNC('month', NOW())::date` (SQL-side) — different mechanism, but ALSO session-tz-dependent; under GMT near month boundary it can compute a different month than the stored APP_TZ string.

**How to apply:** The db/index.mts `options: -c timezone=...` startup param is what actually keeps the session in APP_TZ, so IF that holds, all read paths are correct and consistent with the new write. The whole fix hinges on that startup option surviving the pooler. If it ever doesn't (or on a code path that opens a raw connection), the WRITE is now correct but READS drift — an envelope's stored `2026-07-01` row won't match a `2026-06-30` read filter, so allocations appear to vanish for the current month. Verify `-c timezone` is actually honored by the deployment's pooler before trusting this. The correct belt-and-suspenders would have been to also send date STRINGS on the read side (or `::date` a text literal), not only the write side.
