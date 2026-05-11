---
name: Period preset boundaries
description: "Last period" should match the preset's notion of a period — calendar months, not span subtraction
type: feedback
---

When the period preset is "this month", the "last period" for trend comparison should be the previous CALENDAR month (Feb 1 → Mar 1 if current is Mar 1 → Apr 1), not (start − span, start) where span is `end − start` in ms.

**Why:** CategoriesPage.tsx ~188 computes `lastPeriod = (start − span, start)`. For a 31-day current month (March), the lastPeriod window is `[Feb 28 → Mar 31)` — 31 days of February that don't actually exist, partially overlapping with March. Trend comparisons get noisy.

**How to apply:**
- For named presets (this-month, last-month, this-year), use calendar-aligned helpers (`subMonths`, `subYears` from date-fns) to build the comparison window.
- For custom ranges, span subtraction is the right default.
- The space.isPersonal user is in BST (UTC+6) per repo memory. App-tz boundaries should match Dhaka midnight — confirm via `formatInAppTz`-aligned helpers, not raw `new Date(year, month, 1)` which uses the server/browser local timezone.
