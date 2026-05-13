---
name: apptz-month-helpers
description: Web UI classifies past/current/future months — must use `getAppTzYear/Month`, not native `getFullYear/Month`, or it drifts for non-Dhaka users.
type: project
---

Any calendar math that compares "the viewed month" to "now" — e.g. `monthOrdinal = year*12 + month` to classify past vs. current vs. future — must read year/month via the APP_TZ-aware helpers in `apps/web/src/lib/dates.ts`:

- `getAppTzYear(date)`, `getAppTzMonth(date)`, `getAppTzDate(date)`
- `makeAppTzDate(year, month, date)` to *construct* a Date for an APP_TZ wall-clock day
- `addMonthsClamped`, `startOfMonth`, `endOfMonth` already use these internally

**Why:** Server's APP_TZ is Asia/Dhaka (UTC+6). Native `Date.getMonth()` / `new Date(y, m, 1)` use the browser's local tz. A US-Eastern user at 11pm on June 30 sees `getMonth() = 5` (June) while server-side "now" in APP_TZ is already July. Worse, `new Date(2026, 6, 1)` in their tz is `June 30 18:00 UTC`, which `startOfMonth` (APP_TZ-aware) then snaps **back to June** — so the page renders the July slug but queries the June window. Same hazard applies to `monthSlug()` if it builds the slug from native getters.

**How to apply:** When auditing a page that takes a `YYYY-MM` slug, displays past/current/future state, or jumps to "today":
1. `parseMonthSlug` must build with `makeAppTzDate`.
2. `monthSlug` must read with `getAppTzYear` + `getAppTzMonth`.
3. Any `monthOrdinal` / `nowOrdinal` math must use the APP_TZ getters on both sides — both must be read the same way or the comparison flips at the month boundary.

CLAUDE.md flags this footgun explicitly under the "APP_TZ-aware date math (web)" bullet. The transaction date picker demonstrates the correct pattern.

Related: [[envelope-carryin-semantics]]
