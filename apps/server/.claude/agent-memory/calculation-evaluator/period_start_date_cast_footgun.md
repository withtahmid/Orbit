---
name: period-start-date-cast-footgun
description: Binding a JS Date param to ${x}::date ignores session TZ (takes UTC calendar substring); split-brain drifted period_start data means read-cast fixes can break numbers.
metadata:
  type: project
---

The `${jsDate}::date` footgun (analytics/budgeting SQL).

node-pg sends a bound JS `Date` as a TEXT literal like `2026-06-30 18:00:00+00`.
Casting that text STRAIGHT to `::date` takes the literal calendar substring
(`2026-06-30`) and IGNORES the `+00` offset AND the session TimeZone — even though
the session is `Asia/Dhaka`. An APP_TZ month-start instant (`2026-07-01 00:00 Dhaka`)
is `2026-06-30T18:00Z`, so `${x}::date` yields `2026-06-30` (off by one day / early).

**Fix pattern:** cast through `::timestamptz` FIRST: `${x}::timestamptz::date`.
Empirically verified on Neon: `$1::date` → 2026-06-30 (WRONG), `$1::timestamptz::date`
→ 2026-07-01 (correct). A value ALREADY of type timestamptz casts to ::date correctly;
only the untyped/text bound param is the trap.

**Two distinct comparison contexts — they behave differently:**
- date-cast vs `transaction_datetime` (timestamptz col): the date coerces to
  session-TZ midnight, so buggy window is shifted a full day EARLY → real off-by-one.
  (spaceSummary/personalSummary envelope-consumed, cumulativeSpend is_current.)
- date-cast vs `period_start` (date col): date-to-date, drift interacts with the
  STORED period_start values (see split-brain below).
- UTC-midnight instants (`Date.UTC(y,0,1)` in yearReport) are NOT affected — a
  `00:00Z` value's calendar substring survives ::date identically. yearReport's
  ::date casts are drift-free.

**SPLIT-BRAIN DATA (as of 2026-07):** the WRITE path (createAllocation, allocation/
transfer) was already fixed to store `appTzMonthStartString(...)` (verbatim `2026-07-01`),
but LEGACY rows written before that fix are drifted one day early (`2026-06-30`,
`2026-05-31` observed). So a read that uses buggy `${x}::date` currently COMPENSATES
for the drifted legacy rows and returns correct-looking numbers; mechanically switching
that read to `::timestamptz::date` returns 0/empty for those envelopes until the stored
data is corrected. resolveEnvelopePeriodBalance uses EQUALITY (`period_start = ${start}::date`)
so it's most fragile.

**How to apply:** When fixing a `${x}::date` read, first determine (a) is x an
APP_TZ month-start instant (drift-prone) or a UTC-midnight instant (safe), and
(b) is it compared to a timestamptz col (independent off-by-one, safe to fix alone)
or to `period_start` date col (must ALSO backfill/migrate drifted legacy rows or
the fix breaks live numbers). Recommend a data backfill (`period_start` → correct
APP_TZ month-start string) alongside any read-cast fix touching allocations.
