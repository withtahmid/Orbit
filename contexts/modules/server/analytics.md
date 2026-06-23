# analytics module (server)

> The per-space analytics surface: read-only procedures that power Overview, Envelopes, Events, Trends, Anomalies, and the Year report. Every procedure is `authorizedProcedure`, requires owner/editor/viewer membership of the target space, and reads from `transactions` (folding `fee_amount` rows in as expense).

## Router

- File: `apps/server/src/routers/analytics.mts:38`. Top-level keys plus two sub-routers (`trends`, `anomalies`).

Procedure groupings (in router order):

| Group | Procedures |
| --- | --- |
| Summary cards | `spaceSummary`, `todaySummary` |
| Cash flow | `cashFlow`, `cumulativeSpend` |
| Categories | `topCategories`, `topCategoriesByBucket`, `categoryBreakdown`, `categoryWoW`, `priorityBreakdown`, `topMerchants`, `incomeBreakdown` |
| Envelopes | `envelopeUtilization`, `envelopeRecentAverages`, `unbudgetedTrend` |
| Events | `eventTotals`, `eventCategoryBreakdown` |
| Accounts | `accountDistribution`, `accountBalanceHistory`, `balanceHistory`, `netWorthHistory` |
| Allocations | `allocations` |
| Heatmaps & reports | `spendingHeatmap`, `yearReport` |
| Recurring detection | `recurring` |
| `trends` sub-router | `dailyComparison`, `yearOverYear`, `categoryMovers` |
| `anomalies` sub-router | `outliers`, `recurring`, `patternBreaks`, `streaks`, `shapeStats` |

## Procedures

All are `.query`, all share the same membership/`safeAwait` boilerplate. Inputs default to `{ spaceId, periodStart, periodEnd }` unless noted.

### Summary cards

- **`spaceSummary`** (`procedures/analytics/spaceSummary.mts:9`) — Wide overview: `totalBalance`, `spendableBalance`, `lockedBalance` (liabilities subtracted, locked accounts excluded from spendable), envelope `allocated/consumed/remaining` for the current cadence period, `unallocated = spendable - Σ GREATEST(0, allocated − consumed)` (the "held" cash each envelope ties up, clamped so overspend never inflates free cash), plus dual `period*` (cash) and `operational*` (excludes transfer principal) income/expense. The dual classification is the canonical reference; see "Domain math" below.
- **`todaySummary`** (`procedures/analytics/todaySummary.mts:19`) — IN/OUT/count for a single day; day boundaries computed by Postgres `date_trunc('day', ...)` so they honor the session timezone (`todaySummary.mts:38-43`).

### Cash flow

- **`cashFlow`** (`procedures/analytics/cashFlow.mts:9`) — Bucketed income/expense/net series. Input includes `bucket: "day"|"week"|"month"` and `mode: "cash"|"operational"`. Implementation builds a `buckets` CTE via `generate_series` and a `deltas` CTE; the `xferFactor = mode==='cash' ? 1 : 0` (`cashFlow.mts:69`) gates the transfer-principal CASE branches. Transfer fees are always counted as outflow when the source is in scope (`cashFlow.mts:112-117`). Result is left-joined onto buckets so empty buckets render as zero.
- **`cumulativeSpend`** (`procedures/analytics/cumulativeSpend.mts:20`) — Day-level cumulative spending over the current and (matching duration) previous window, optional `project: boolean` extrapolation. Input: `{ periodStart, periodEnd, includePrevious=true, project=false }`.

### Categories

- **`topCategories`** (`procedures/analytics/topCategories.mts:25`) — Top-N leaf categories by spend over a window. `spending` CTE `UNION ALL`s `(expense_category_id, amount)` from expense rows with `(fee_expense_category_id, fee_amount)` from transfer rows (`topCategories.mts:56-72`). Uses **`source_account_id IN scope_accounts`** rather than `transactions.space_id` so totals match `cashFlow` (see comment `topCategories.mts:17-23`).
- **`topCategoriesByBucket`** (`procedures/analytics/topCategoriesByBucket.mts`) — Per-bucket per-category time series for stacked bars.
- **`categoryBreakdown`** (`procedures/analytics/categoryBreakdown.mts:9`) — Recursive subtree expenditure per category. `WITH RECURSIVE tree AS ... UNION ALL ...` (`categoryBreakdown.mts:37`) climbs the parent-id tree; `spending_rows` again unions expense + transfer-fee rows. Returns one row per category with both `directTotal` and `subtreeTotal`. Filters by `transactions.space_id` (NOT account scope) — historical (likely a follow-up cleanup target alongside `topCategories`).
- **`categoryWoW`** (`procedures/analytics/categoryWoW.mts:18`) — Week-over-week category deltas anchored at `input.anchor ?? new Date()`. Limit defaults 6.
- **`priorityBreakdown`** (`procedures/analytics/priorityBreakdown.mts`) — Spending grouped by category `priority` (low/medium/high — see migration `031_add_category_priority.mts`).
- **`topMerchants`** (`procedures/analytics/topMerchants.mts:19`) — Top-N by normalized description, with current vs previous-window totals so the UI shows trend arrows.
- **`incomeBreakdown`** (`procedures/analytics/incomeBreakdown.mts:21`) — Per-source split of income deposits (and crediting adjustments) in the window.

### Envelopes

- **`envelopeUtilization`** (`procedures/analytics/envelopeUtilization.mts:20`) — One row per envelope (no per-account `breakdown[]` — allocations are space-wide). Cadence-aware: `monthly` envelopes sum the per-month allocation rows whose `period_start` lands in the requested window (one row per month) and count window-scoped spend; rolling/goal envelopes (`cadence='none'`) report the single NULL-period lifetime pool row and lifetime spend, window-independent. `remaining = allocated − consumed`, no carry-over. Also surfaces goal fields (`lifetimeFunded`, `pctSaved`/`targetAmount`/`targetDate`) and a `lifetimeOverrun` (rolling only).
- **`envelopeRecentAverages`** (`procedures/analytics/envelopeRecentAverages.mts`) — Trailing-N-period averages per envelope; powers "you usually spend ~$X" hints.
- **`unbudgetedTrend`** (`procedures/analytics/unbudgetedTrend.mts`) — Trend in spending that's NOT covered by envelope allocations. Input `{ spaceId, windowDays: int(1..730, default 90) }`.

### Events

- **`eventTotals`** (`procedures/analytics/eventTotals.mts:9`) — Per-event income/expense totals and `txCount`. Input `{ spaceId, eventId? }` — passing `eventId` narrows to a single event so the detail page reuses the same procedure. Returns each event's `status`, `closed_at`, and `estimated_amount` alongside totals (`eventTotals.mts:46-49`) so the UI can render "Closed Mar 14" subtitles and budget bars without a second fetch.
- **`eventCategoryBreakdown`** (`procedures/analytics/eventCategoryBreakdown.mts:13`) — Leaf-category spend within a single event. Input `{ eventId }`; resolves space via the event row, then membership-gates. NOT folded with transfer fees — events almost never have transfer-fee spend, and adding the union would muddy the per-category UI.

### Accounts

- **`accountDistribution`** (`procedures/analytics/accountDistribution.mts`) — Balance per account in the space; pie/treemap input.
- **`accountBalanceHistory`** (`procedures/analytics/accountBalanceHistory.mts`) — Time-bucketed balance trace for a single account.
- **`balanceHistory`** (`procedures/analytics/balanceHistory.mts:9`) — Multi-account history. `accountIds: string[]?` filter, empty array = all space accounts (`balanceHistory.mts:14-16`).
- **`netWorthHistory`** (`procedures/analytics/netWorthHistory.mts:22`) — Sum of balances treating liability accounts as negative; bucketed.

### Allocations

- **`allocations`** (`procedures/analytics/allocations.mts`) — Space-wide allocation snapshot for the Allocation map view: `accounts[]` (balance + asset/liability/locked class), `envelopes[]` (allocated/consumed/remaining for each envelope's own window — monthly → current calendar month's single row; rolling/goal → lifetime pool), and a `drift` total comparing `allocatedSum` vs `assetBalanceSum`. By-envelope + Totals, NOT a per-account × per-envelope matrix. Matches `envelopeUtilization`.

### Heatmaps & reports

- **`spendingHeatmap`** (`procedures/analytics/spendingHeatmap.mts`) — Day-of-week × week-of-period grid of expenses.
- **`yearReport`** (`procedures/analytics/yearReport.mts:6`) — Annual report. Input `{ spaceId, year: int 2000..2100 }`. Builds yearStart / yearEnd in UTC and aggregates per-envelope, per-category, etc.

### Recurring

- **`recurring`** (`procedures/analytics/recurring.mts:28`) — Heuristic recurring-charge detector for the BillsCard / SubscriptionsGrid. Groups expense transactions by `(source_account_id, LOWER(TRIM(description)))` over `lookbackDays` (default 120), requires ≥3 hits with consistent inter-arrival intervals, then classifies cadence (`weekly/biweekly/monthly/yearly`) and kind (`bill` vs `subscription`) using helpers in `procedures/analytics/utils/recurringDetect.mts`. The shared helper module is also imported by `anomalies.recurring` and `anomalies.patternBreaks` so the four surfaces stay consistent.

### `trends` sub-router

- **`trendsDailyComparison`** (`procedures/analytics/trendsDailyComparison.mts`) — Current period vs prior period daily spend. Granularity enum (week/month/year), `anchor: Date?` defaults to today, dual `cash`/`operational` mode (`trendsDailyComparison.mts:6-12`).
- **`trendsYearOverYear`** (`procedures/analytics/trendsYearOverYear.mts`) — Monthly buckets for a year vs the previous year. `year?` defaults to current calendar year.
- **`trendsCategoryMovers`** (`procedures/analytics/trendsCategoryMovers.mts`) — Categories whose period-over-period delta is largest. `limit: int 1..50, default 10`.

### `anomalies` sub-router

- **`anomaliesOutliers`** (`procedures/analytics/anomaliesOutliers.mts:20`) — Per-category z-score outliers within a window. `sigma: 1..5, default 2`. Categories with fewer than 3 hits in the window are skipped to keep `STDDEV_SAMP` stable (`anomaliesOutliers.mts:79-82`).
- **`anomaliesRecurring`** (`procedures/analytics/anomaliesRecurring.mts`) — Recurring charges that have moved by ≥`minDeltaPct` or ≥`minDeltaAmount`, or appear to have cancelled (no hit within `cancelGraceDays` past the expected next date).
- **`anomaliesPatternBreaks`** (`procedures/analytics/anomaliesPatternBreaks.mts`) — Recurring charges whose next expected hit hasn't arrived within `lookaheadDays + graceDays`.
- **`anomaliesStreaks`** (`procedures/analytics/anomaliesStreaks.mts`) — Run-of-day streaks of zero-spend and high-spend.
- **`anomaliesShapeStats`** (`procedures/analytics/anomaliesShapeStats.mts`) — Distribution shape statistics (skew, kurtosis-style measures) per category.

## Domain math / invariants

### Cash vs operational

`spaceSummary`, `cashFlow`, `trendsDailyComparison` all expose a `mode: "cash" | "operational"` switch implemented as a `0/1 factor` multiplier on the transfer-principal CASE branches. The classification rules (`spaceSummary.mts:138-167`):

- **cash** — what your bank ledger shows. Cross-space transfer principal counts directionally (an inbound transfer from a non-scope account is `income`; outbound to a non-scope account is `expense`). Internal transfers (both legs in scope) net to zero. Adjustments count.
- **operational** — true income vs true expense. Transfer principal **excluded both directions**. Only `type='income'`, `type='expense'`, `type='adjustment'`, plus transfer fees (which always leave the system).

The `operationalIncome`/`operationalExpense` fields exist because moving money between your own checking and savings looks like "expense" under cash semantics — misleading on "Income / Expense" cards.

### Transfer-fee folding

A transfer row with `fee_amount` represents two things at once: a principal movement (source → destination, value preserved) and a fee paid (source → bank, value lost). The standard pattern across the module is:

```sql
SELECT t.amount, t.expense_category_id ...
WHERE t.type = 'expense'
UNION ALL
SELECT t.fee_amount, t.fee_expense_category_id ...
WHERE t.type = 'transfer' AND t.fee_amount IS NOT NULL
```

Used in `topCategories.mts:56-72`, `categoryBreakdown.mts:46-63`, and the personal twins (see that module). Without this, a user routing all their spend through transfer fees would invisibly bypass their envelope budgets.

### Scope rule

Per the long-standing migration / comment trail (`topCategories.mts:17-23`, `cashFlow.mts:50-67`), the canonical "what counts as this space" predicate is account-scoped:

```sql
WITH scope_accounts AS (
    SELECT account_id FROM space_accounts WHERE space_id = $1
)
... WHERE source_account_id IN (SELECT account_id FROM scope_accounts)
       OR destination_account_id IN (SELECT account_id FROM scope_accounts)
```

`transactions.space_id` is a categorization tag (see `transaction` module doc). Procedures still in transition (`categoryBreakdown`, `incomeBreakdown`, `topCategoriesByBucket`) filter by `space_id` directly; this is documented as a known drift and they may misalign with `cashFlow` totals on cross-space transactions.

### Envelope period semantics

Monthly envelopes **reset** every period — there is no carry-over. The window's `remaining = allocated − consumed`; an overspent envelope shows `remaining < 0` (drift) but never inflates space `unallocated`, which clamps each envelope's held to `GREATEST(0, allocated − consumed)`. Rolling/goal envelopes (`cadence='none'`) are a single lifetime pool. Allocations are space-wide (one row per envelope+period); envelope `consumed` matches `transactions.envelop_id` directly. Implemented identically across `envelopeUtilization`, `allocations`, `spaceSummary`, and the personal twin `summary.mts`.

## Conventions & gotchas

- Every procedure starts with `resolveSpaceMembership` against owner/editor/viewer. Don't add a new analytics procedure that bypasses this — there is no read-only data here that's safe to leak across space boundaries.
- Almost all procedures wrap the SQL block in `ctx.services.qb.transaction().execute(...)`, even though they're queries. The transaction gives them a consistent snapshot when multiple sub-queries are involved.
- The `cash` vs `operational` switch is implemented as a multiplier on the SQL, not by emitting different queries. The two CASE branches are always there; the mode only changes whether the transfer-principal slot is `amount` or `amount * 0`. This means logging the SQL doesn't tell you which mode ran — check the input.
- Day/week/month bucketing always uses Postgres `date_trunc(<bucket>, t::timestamptz)` to respect the session timezone (e.g. Asia/Dhaka in dev). Computing window bounds in JS via `Date.UTC` will slice UTC days, which is wrong for non-UTC sessions. See `todaySummary.mts:38-43` for the standing note.
- Several procedures use `generate_series` to materialize empty buckets so charts have a zero-filled axis. Removing the `LEFT JOIN deltas` against the bucket series will cause gaps to disappear from the chart.
- `recurring`, `anomalies.recurring`, `anomalies.patternBreaks`, and the BillsCard share a single classifier in `procedures/analytics/utils/recurringDetect.mts`. If you change "what counts as a subscription" logic, every dependent procedure shifts.

## Cross-references

- `personal/*` (`routers/personal.mts:42`) — every analytics procedure here has a cross-space personal twin; see the personal module doc for the owned-account scope and internal-transfer rule.
- `transaction.list` / `transaction.filteredTotals` (transaction module) duplicate the in/out folding logic; they are intentionally compatible with `analytics.cashFlow`.
