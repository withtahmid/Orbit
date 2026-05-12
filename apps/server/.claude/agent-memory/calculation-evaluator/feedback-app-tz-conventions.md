---
name: feedback-app-tz-conventions
description: How Orbit handles wall-clock dates — APP_TIMEZONE=Asia/Dhaka, helpers in @/lib/dates project to UTC fields; native Date getters/setters are browser-local and must be avoided on those Date objects.
metadata:
  type: feedback
---

Orbit treats all wall-clock dates (period windows, datetime-local inputs, calendar grids) as APP_TIMEZONE = Asia/Dhaka. The helper module at `apps/web/src/lib/dates.ts` implements this with `projectToAppTz` (adds +6h to UTC fields) and `unprojectFromAppTz` (inverse). Every helper there — `addDays`, `addMonths`, `startOfDay`, `startOfMonth`, `startOfWeek`, `startOfIsoWeek`, `startOfQuarter`, `startOfYear`, `endOfDay`, `endOfMonth`, `endOfYear`, `toInputDate`, `toInputDateTime`, `fromInputDate`, `fromInputDateTime`, `shiftForFormat` — produces or consumes absolute Dates that round-trip correctly through APP_TZ wall-clock.

**Trap to watch for in audits:** the absolute Date returned by `fromInputDateTime("2026-05-13T14:30")` represents `2026-05-13 14:30 Asia/Dhaka`, i.e. `2026-05-13T08:30:00.000Z`. If browser code then calls `.getHours()`, `.getFullYear()`, `.getMonth()`, `.getDate()`, `.getDay()`, `.setHours()`, `.setMinutes()`, `.setFullYear()`, `.setSeconds()` on that Date, it reads/writes in the **browser's local timezone**, not Asia/Dhaka. For a user in PST that's 16h off — they'd see "00:30" in the picker while the chip says "Today, 2:30 PM" via toLocaleString in their tz.

**Why:** The codebase chose fixed-offset arithmetic (Dhaka has no DST) instead of `date-fns-tz`. That decision is documented in the `dates.ts` header — it works *only* when downstream code consistently uses the helpers and never reaches for native Date instance methods on these absolute Dates.

**How to apply:** When auditing date math in this repo, flag any `.getHours/getMinutes/getDate/getMonth/getFullYear/getDay` or `.setHours/setMinutes/setFullYear/setSeconds` call on a Date that came from `fromInputDateTime`, `startOfDay`, `startOfMonth`, `addDays`, etc. The correct pattern is to either (a) operate via the helpers, or (b) project via `projectToAppTz` first and read `getUTC*`. For calendar grids the safe pattern is to build cells using `addDays(startOfMonth, n)` and read display digits via `toInputDate(d).slice(8,10)` rather than `d.getDate()`. The `defaultDateTime()` form helper and the picker's `setNow()`/`setYesterday()`/`pickDate()`/`setHours24()`/`setMinutes()`/`togglePeriod()` paths and `MonthGrid` are all current offenders — see TransactionDatePicker.tsx audit notes.

Related: [[user-location]] — user is in BST (UTC+6), which coincidentally is also Asia/Dhaka offset, so bugs of this class are invisible during local dev and only manifest for users outside +0600. Always reason about a non-Dhaka browser (e.g. PST, IST, JST) when testing TZ-correctness changes.
