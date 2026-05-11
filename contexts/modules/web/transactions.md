# Transactions (web)

> A filterable, paginated transaction ledger with a totals summary, detail sheet, and new/edit drawers; dispatches to cross-space data in the personal sentinel space.

## Route(s)
- Path: `ROUTES.spaceTransactions(id)` -> `/s/:spaceId/transactions` (`apps/web/src/router/routes.ts:15`).
- Lazy-imported in `apps/web/src/router/index.tsx:28`, mounted at `apps/web/src/router/index.tsx:160-162` under `SpaceLayout`.
- Guards: `ProtectedRoute` -> `CurrentSpaceProvider` -> `SpaceLayout`. Personal-aware: when `space.isPersonal` it switches every query and replaces the account filter source with `personal.ownedAccounts`.

## Files
- Main page: `apps/web/src/pages/space/transactions/TransactionsPage.tsx` (~1954 lines) — single big file containing topbar, filter strip, results list, paginator, totals card, and the inline `PeriodChip` component, plus the page's `TX_STYLES` CSS. Treat it as a monolith; the detail/edit/new flows live as separate feature components mounted within it.
- Feature components:
  - `apps/web/src/features/transactions/NewTransactionSheet.tsx` — multi-step sheet with income / expense / transfer / adjustment forms (~1900+ lines). Mutations: `transaction.income`, `transaction.expense`, `transaction.transfer`, `transaction.adjust`, plus inline allocation top-up via `allocation.transfer` and `envelop.borrowFromNextMonth`.
  - `apps/web/src/features/transactions/EditTransactionSheet.tsx` — uses `transaction.update` (`:291`).
  - `apps/web/src/features/transactions/TransactionDetailsSheet.tsx` — read-only view + file attachments via `file.listForTransaction` (`:108`), `transaction.update` for inline edits, `file.removeFromTransaction` (`:335`).

## tRPC procedures consumed
Real-space + personal twins (toggled with `{ enabled: !isPersonal }` / `{ enabled: isPersonal }`):
- `account.listBySpace` + `personal.ownedAccounts` — filter-bar account dropdown (`TransactionsPage.tsx:95-114`).
- `expenseCategory.listBySpace` + `personal.listCategories` — category dropdown (`:116-125`).
- `event.listBySpace` — event filter, real-space only (`:127-130`).
- `transaction.listBySpace` + `personal.transactions` — paginated list (`:136-171`).
- `transaction.filteredTotals` + `personal.transactionFilteredTotals` — IN / OUT / NET / AVG-DAY summary across the entire filtered set, not just the current page (`:245-256`).

Mutations:
- `transaction.delete` -> calls `useInvalidateAnalytics(space.id)` from `@/lib/invalidate` (`:195-201`).
- New/Edit/Details sheets fire their own mutations and invalidations (see Files above).

## State & mutations
- Filters live in the URL via `useSearchParams` — keys: `type`, `account`, `category`, `event`, `user`, `q`, `min`, `max`, plus `period` / `from` / `to` (via `usePeriod`). Reset preserves only the period (`TransactionsPage.tsx:283-298`).
- Search input is debounced 300ms (`useDebouncedValue`, `:93`).
- Pagination is cursor-based, tracked in a local `pageCursors` array so "back" works (`:132-133`).
- `selectedTx` state opens the `TransactionDetailsSheet`.
- The "New transaction" CTA is wrapped in `PermissionGate roles={["owner","editor"]}` (`:367-378`) — same gate appears inline near each row's edit action (~`:708`).

## Conventions & gotchas
- Same filter object shape is reused for `listBySpace` and `filteredTotals`, but the totals query takes only filters (no `cursor`/`limit`); the input is memoized (`:219-244`) so react-query doesn't re-key per render.
- `period.start` / `period.end` come from `usePeriod` — the period is also URL-persisted.
- Personal-mode dispatch is everywhere: each query has a `Space` variant and a `Personal` variant, then `const x = isPersonal ? personal : space`. Don't forget to extend both sides when adding a new filter.
- All event-filter UI silently disables in personal mode because `event.listBySpace` is `{ enabled: !isPersonal }`. The chip-row logic at `:329-337` still tries to render an event chip from the cached map if `eventId` is in the URL.
- The page wraps inside `.orbit-design tx-root` (`:340`); CSS is in the inline `TX_STYLES` template literal at the bottom.
- Money formatting uses `formatInAppTz` for dates and the local `UNALLOCATED_COLOR` for the unallocated chip color (`:46`).

## Cross-references
- Server: `apps/server/src/procedures/transaction/*` and the personal twins in `apps/server/src/procedures/personal/*` (e.g. `transactions.mts`, `transactionFilteredTotals.mts`).
- Web: feeds the Overview "recent transactions" indirectly via the same `transaction.listBySpace` proc; account detail's Transactions tab in `pages/space/accounts/AccountDetailPage.tsx` uses the same proc with an `accountId` filter; new/edit sheets share the allocations helpers from `features/allocations/*`.
