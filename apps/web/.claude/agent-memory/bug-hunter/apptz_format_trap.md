---
name: apptz-format-trap
description: APP_TZ-constructed Dates must be formatted with formatInAppTz, not native toLocaleString/getMonth, or labels drift for non-Dhaka browsers
metadata:
  type: project
---

When a Date is constructed via `makeAppTzDate(...)` (apps/web/src/lib/dates.ts), its absolute instant is the APP_TZ (Asia/Dhaka, UTC+6) wall-clock moment — e.g. `makeAppTzDate(2026, 2, 1)` is `2026-02-28T18:00:00Z`. Formatting such a date with **native** `Date.toLocaleString`, `getFullYear`, `getMonth`, etc. interprets it in the **browser's** local tz, so a user west of Dhaka sees the previous day/month.

**Why:** The simplify-budgeting branch moved date *construction* to APP_TZ helpers but several display sites (e.g. `monthLabel`/`prevMonthLabel` in BudgetMonthPage.tsx) still call native `monthDate.toLocaleString("en-US", {month, year})`. The mismatch silently drifts the displayed month for any non-Dhaka browser.

**How to apply:** Any time you see a Date produced by `makeAppTzDate`/`startOfMonth`/`addMonths` from dates.ts being rendered, confirm the render path uses `formatInAppTz` (apps/web/src/lib/formatDate.ts) or the `getAppTz*` accessors — not native `toLocaleString`/`getMonth`/`getFullYear`. Flag native locale formatting on APP_TZ dates as a display-drift bug.
