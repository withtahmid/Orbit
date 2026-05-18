---
name: target-date-tz-drift
description: envelope target_date stored as `date` but client sends `new Date("YYYY-MM-DD")` which is midnight UTC — when server's session tz is west of UTC the date is silently rolled back one day
metadata:
  type: project
---

Pattern introduced with migration 046 envelope targets. `BudgetsPage.tsx` builds:
```
new Date(targetDate)  // targetDate is "YYYY-MM-DD" from <input type="date">
```
This parses as midnight UTC. Postgres converts to `date` using the SESSION tz. If PG's session is UTC or east-of-UTC (Asia/Dhaka), date is stored unchanged. If PG session is west of UTC (e.g., America/Los_Angeles), midnight UTC is the PREVIOUS local day, and `date_column = '2026-12-30'` instead of `2026-12-31`.

**Why:** Project memory `user_location` says current dev is in BST (UTC+6), so the bug doesn't manifest locally. Production tz may differ.

**How to apply:** This pattern is repeated wherever a date-only field flows from a `<input type="date">` through `new Date()` → server. The right fix is to send the literal "YYYY-MM-DD" string and let the server coerce, OR to use the project's APP_TZ-aware constructors. Watch for any new `new Date(<date string>)` near a form submission whose Zod schema is `z.coerce.date()` going into a `date` column.
