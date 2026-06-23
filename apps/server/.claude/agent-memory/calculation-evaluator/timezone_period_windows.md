---
name: timezone-period-windows
description: How APP_TZ (Asia/Dhaka) flows through SQL period math and how JS periodWindow mirrors it; the date vs timestamptz comparison rule.
metadata:
  type: project
---

Postgres session timezone is set to `ENV.APP_TIMEZONE` (default Asia/Dhaka, UTC+6,
no DST) via `SET TIME ZONE` on every pooled connection (`src/db/index.mts`).

Consequences:
- `DATE_TRUNC('month', NOW())::date` yields the APP_TZ month-start `date`.
- A `date >= timestamptz` (or reverse) comparison casts the `date` to a
  `timestamptz` at APP_TZ midnight — so `transaction_datetime >= p_start` where
  p_start is a date correctly means "from APP_TZ month-start midnight".
- `timestamptz::timestamp` (e.g. `windowStart::timestamp`) converts to APP_TZ
  wall clock, so `DATE_TRUNC('month', windowStart::timestamp)` truncates in APP_TZ.

`period_start` column is type `date`. `transaction_datetime` is `timestamptz`.

`procedures/envelop/utils/periodWindow.mts` recomputes the same month boundaries
in JS using Intl offset + guess-and-correct so JS-passed `start`/`end` instants
align with SQL. For Asia/Dhaka (no DST) the first guess is always exact.

**How to apply:** When SQL uses `DATE_TRUNC('month', NOW())` for the window it is
consistent with JS `appTzMonthStartInstant`. Both anchor to APP_TZ. No mismatch.
