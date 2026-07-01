---
name: transactions-analytics-filterbar
description: TransactionsPage reuses AnalyticsFilterBar for env/acc/cat multi-select; split clear/count ownership between bar and page is a recurring UX-gap source.
metadata:
  type: project
---

TransactionsPage migrated its Account/Category/Envelope filters to the shared
`AnalyticsFilterBar` + `useAnalyticsFilters` hook (URL keys `env`/`acc`/`cat`,
multi-value via repeated params). Server procs (`transaction.list`,
`transaction.filteredTotals`, `personal.transactions`,
`personal.transactionFilteredTotals`) gained plural `accountIds`/`envelopIds`/
`expenseCategoryIds` ALONGSIDE legacy singular params. Precedence: plural
non-empty wins, else singular, else null.

**Why this matters for bug hunting:** ownership of "active filter" state is now
SPLIT. The AnalyticsFilterBar renders its own "Clear all" (env/acc/cat only) and
summary line; the page's `activeFilterCount` deliberately EXCLUDES env/acc/cat
(counts only type/event/user/min/max). So:
- The page-level "Clear" button and the "No transactions match these filters"
  empty-state are gated on `activeFilterCount > 0` and will NOT appear when only
  env/acc/cat are active — even though results are filtered. Recurring gap.
- `resetFilters()` (fresh URLSearchParams keeping only period/from/to) DOES clear
  env/acc/cat, so the reset itself is correct; only its visibility gate is wrong.

**Semantic mismatch:** AnalyticsFilterBar's Accounts dropdown footnote says
"Money leaving the selected account(s)" (analytics uses source_account_id only),
but the transaction procs filter source OR destination. Footnote misleads on the
transactions page.

**How to apply:** When reviewing changes to TransactionsPage filters or the shared
bar, check that clear/empty-state/count logic accounts for env/acc/cat, and that
any new deep-link uses `cat`/`acc`/`env` (NOT legacy `category`/`account`/
`envelope`). CategoriesView drill-focus param is also `cat` (single value) but
lives on a different route, so no live collision.
