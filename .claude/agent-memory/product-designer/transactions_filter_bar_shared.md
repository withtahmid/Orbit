---
name: transactions-filter-bar-shared
description: Transactions page adopted the analytics AnalyticsFilterBar (multi-select env/acc/cat) + statement Balance column; open items to watch
metadata:
  type: project
---

The Transactions page (`apps/web/src/pages/space/transactions/TransactionsPage.tsx`) was reworked (branch `fix-transaction-filter`, latest review 2026-07-01) to reuse the analytics `AnalyticsFilterBar` + `useAnalyticsFilters` (URL params `env`/`acc`/`cat`, multi-select) and shared `PeriodChip`, replacing single-select pickers. Default period this-month -> last-30-days. The `MoreFiltersSheet` modal is GONE; Event (single) + Amount (min/max) are now inline chips via the bar's `trailingChips` slot.

**"No envelope" filter was REMOVED** (superseding an earlier iteration that restored it). **Why (product owner):** unassigned-envelope rows only occur on transfers, which the Type filter already covers.

**Balance column is now ALWAYS-ON** (`showBalance = true` hardcoded), superseding the earlier single-account-only design. Server `transaction/list.mts` + new `utils/accountRunningBalance.mts`: single account selected -> `computeBalanceAfter` (statement mode, one running balance + `tx-statement-note` caption banner); multi/none -> `computeRowAccountBalances` returns per-account `account_balances_after` (colour dot + account, two lines for a transfer). Balance is **full-history** (all spaces, ignores active filters/pagination), signed per balance trigger (018), ordered `(transaction_datetime, id)`. Personal `/s/me` passes only caller-owned accounts as the leak boundary.

**Why:** avoid duplicate filter UIs; multi-select + running balance move the page toward "review and reconcile against a bank statement."

**RESOLVED in round 4 (reviewed 2026-07-01, green-lit):**
- **AccountDetailPage now shows the per-row Balance column** (`AccountDetailPage.tsx:229`) reading `account_balances_after[account.id]`, matching statement mode. Parity closed.
- **Category filter restored on `/s/me`** via new `personalCategories` opt-in prop on `AnalyticsFilterBar`, sourced from `personal.listCategories` (returns categories across caller's member spaces). Envelopes + Events stay hidden on personal (correctly gated in the URL-arg layer: `envelopIdsArg`/`eventId` forced undefined/null when isPersonal). No cross-space leak — listCategories scopes to member spaces and txn filter runs against owned-account rows only.
  - Minor wrinkle (non-blocking): flat picker can show two same-named categories from two spaces as distinct rows; picker does not group/label by space_id. Follow-up only if users report confusion.

**Still open:**
- **Full-history balance vs. narrowed list:** when type/date/search/amount narrows the list, consecutive visible rows' balances do NOT step by the visible amount (intervening hidden rows moved the account). Correct but confusing in multi-account mode; the statement caption should say the balance is the account's true balance "across all activity," and ideally suppress or caption the column when a non-account filter is active alongside multi-account.
- **`showBalance = true` is dead-flag scaffolding** with a comment describing conditional behavior that no longer exists; column is always-on. Cosmetic — inline it.
- **Two "Clear all" scopes:** bar's `onClearAll`=`resetFilters` clears env/acc/cat (+ verify it also clears `q` search and Type); `hasAnyFilter` is passed the broader `hasActiveFilters` (includes search). If Clear leaves search/Type lit -> classic "clear didn't clear."
- **Duplicated period default:** page `usePeriod("last-30-days")` + `PeriodChip defaultPreset="last-30-days"` are two hook instances over the same URL params — safe only while defaults match. Hoist to a shared constant.
- **Deep-link param migration:** CategoriesView now links `?cat=` (was `?category=`); the reader dropped singular `?account=`/`?envelope=`/`?category=`. AccountDetail/EventDetail embed their own lists (don't deep-link), so no live breakage, but any old bookmarks/`?account=` links silently no-op.
