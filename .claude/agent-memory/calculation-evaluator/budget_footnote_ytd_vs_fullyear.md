---
name: budget-footnote-ytd-vs-fullyear
description: BudgetDetailPage "Monthly spend" footnote compares YTD spent against full-12-month allocated — inverts/misstates over/under for the current in-progress year
metadata:
  type: project
---

BudgetDetailPage.tsx "Monthly spend" footnote for monthly-cadence envelopes:
`Spent {ytdSpent} of {totalAllocated} allocated this year — {|diff|} over/under`.

BUG (CRITICAL): numerator and denominator span different windows.
- `ytdSpent = monthly.ytdSpent = thisTotal` = sum of `thisYear[0..windowMonths)`
  where windowMonths stops at the first null (server nulls future months only
  when `year === curYear`). So for the CURRENT year it is year-to-date.
- `totalAllocated` = sum of ALL 12 entries in `allocQuery.data.allocated`
  (server has no future-month cutoff on allocations).

**Why:** For the current in-progress year this compares N months of spend vs 12
months of allocation. Flat $1000/mo, on-pace, in June: X=$6000, Y=$12000 →
"$6000 under" (actually $0 / on pace). Overspend $1800/mo Jan-Jun: X=$10800,
Y=$12000 → "$1200 under" while genuinely $4800 OVER — sign inverted, shows green.

Only wrong when `monthly.year === curYear`. Past/complete years are fine (both
sides span 12 months). Year-derivation chain (getAppTzYear(viewingDate) →
yoyQuery → monthly.year → allocQuery → chart labels) is internally CONSISTENT;
the defect is purely the window mismatch, not the year threading.

**How to apply:** Fix = sum allocated over the SAME window as ytdSpent. Expose
`windowMonths` from the `monthly` useMemo and use
`allocatedArr.slice(0, windowMonths).reduce(...)` for the footnote denominator
and the overAlloc check. Chart bullet markers can keep full 12-month allocated.

RESOLVED (verified 2026-07-02, branch envelop-details-fix): fix applied verbatim.
`monthly` useMemo returns `windowMonths`; footnote computes
`ytdAllocated = allocatedArr.slice(0, monthly?.windowMonths ?? 12).reduce(...)`,
copy = "allocated so far this year". Re-traced: on-pace mid-year → "$0 under" (was
"$500 under"); genuine overspend → "$350 over" (was "$150 under", masked). Edge
cases clean: allocQuery not loaded → allocatedArr null → ytdAllocated 0 → footnote
suppressed by `ytdAllocated > 0` gate (Skeleton shows during load anyway); January
windowMonths=0 → both slice(0,0).reduce(…,0)=0 → gate suppresses, no NaN, no
divide-by-zero (block has no division), no "$0 of $0". Chart-vs-footnote scope
difference is DELIBERATE: EnvelopeMonthlyBars indexes `allocated[i]` per month over
all 12 (plan timeline); footnote is the YTD aggregate verdict. Not an inconsistency.
