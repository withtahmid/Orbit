---
name: period-boundary-native-getters
description: Web budget pages must build periodStart via startOfMonth() (APP-TZ), not native Date.getMonth/getFullYear — drift for users outside Asia/Dhaka
metadata:
  type: project
---

The allocation period model (migration 048) keys monthly rows on the APP-TZ (Asia/Dhaka) month-start. Web code that builds a `periodStart` to send to `envelop.allocationCreate` MUST use `startOfMonth()` from `@/lib/dates` (APP-TZ aware), never `new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1))`.

**Why:** `Date.getFullYear()/getMonth()` read the BROWSER-local tz. `BudgetMonthPage.tsx onSave` reconstructs `periodStartUtc` with native getters instead of reusing the already-correct `periodStart = startOfMonth(monthDate)` it computed for the query. Self-consistent when `monthDate` came from `parseMonthSlug` (local-field round-trip), but the no-slug fallback returns an APP-TZ instant → native getters drift it to the wrong month for users far from UTC+6.

**How to apply:** When reviewing budget/allocation web mutations, confirm the `periodStart` passed to the server is the same `startOfMonth(...)` value used for the matching query — not a re-derived `Date.UTC(...)` from native getters. The CLAUDE.md APP_TZ-aware-date-math convention covers this.
