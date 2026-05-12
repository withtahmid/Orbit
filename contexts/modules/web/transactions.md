# Transactions (web)

> A filterable, paginated transaction ledger with a totals summary, detail sheet, and new/edit drawers; dispatches to cross-space data in the personal sentinel space.

## Route(s)
- Path: `ROUTES.spaceTransactions(id)` -> `/s/:spaceId/transactions` (`apps/web/src/router/routes.ts:15`).
- Lazy-imported in `apps/web/src/router/index.tsx:28`, mounted at `apps/web/src/router/index.tsx:160-162` under `SpaceLayout`.
- Guards: `ProtectedRoute` -> `CurrentSpaceProvider` -> `SpaceLayout`. Personal-aware: when `space.isPersonal` it switches every query and replaces the account filter source with `personal.ownedAccounts`.

## Files
- Main page: `apps/web/src/pages/space/transactions/TransactionsPage.tsx` (~1954 lines) — single big file containing topbar, filter strip, results list, paginator, totals card, and the inline `PeriodChip` component, plus the page's `TX_STYLES` CSS. Treat it as a monolith; the detail/edit/new flows live as separate feature components mounted within it.
- Feature components:
  - `apps/web/src/features/transactions/NewTransactionSheet.tsx` — multi-step sheet with income / expense / transfer / adjustment forms (~2600 lines). Mutations: `transaction.income`, `transaction.expense`, `transaction.transfer`, `transaction.adjust`, plus inline allocation top-up via `allocation.transfer` and `envelop.borrowFromNextMonth`. Hosts the lifted `isSaving` state (parent owns it; each sub-form emits `mutate.isPending` via `onPendingChange`) so the footer Save buttons show "Saving…" + spinner the moment the click lands.
  - `apps/web/src/features/transactions/EditTransactionSheet.tsx` — uses `transaction.update` (`:291`). Mirrors the same lifted-`isSaving` pattern. Deliberately does NOT integrate pins or `usePins` — pins are creation-time-only by design.
  - `apps/web/src/features/transactions/TransactionDetailsSheet.tsx` — read-only view + file attachments via `file.listForTransaction` (`:108`), `transaction.update` for inline edits, `file.removeFromTransaction` (`:335`).
  - `apps/web/src/features/transactions/TransactionDatePicker.tsx` — custom date+time picker that replaced the native `<input type="datetime-local">`. Trigger reads as a relative label (`Now`, `Today, 3:42 PM`, `Yesterday, 8:15 PM`, `Mar 5, 3:42 PM`). Popover contains preset chips (`Now`, `Yesterday`), a single-month calendar with full keyboard navigation (arrow keys ±day/±week, Home/End row, PageUp/Down month via `addMonthsClamped`), and a segmented HH/MM/AM-PM time stepper. All date arithmetic uses APP_TZ-aware accessors (`getAppTzHours`, `makeAppTzDate`, etc.) from `lib/dates.ts` — never native `Date.setHours/getHours` on absolute Dates. `nowBaseline` state controls when the "Now" preset chip lights up: snaps to `draft` on open when within 60s, re-snaps on each `Now` click, so the chip reflects user intent rather than drift.
  - `apps/web/src/features/transactions/PinControl.tsx` — small pill button with three states (`pinned` filled brand, `pinnable` outline, `hidden`). 24×24 minimum tap target (WCAG 2.5.8). `aria-pressed` reflects state; `aria-label` carries the action ("Pin this as your default" / "Unpin this default").
  - `apps/web/src/features/transactions/usePins.ts` — React Query wrapper around `pin.listBySpace` / `pin.set` / `pin.clear`. Skips the query entirely on `/s/me` (no real space). Optimistic updates on set + clear read entity details from the corresponding `account/envelop/event.listBySpace` caches so the pin glyph flips immediately.

### Pin integration (inside NewTransactionSheet)

- `FieldPin` adapter (`NewTransactionSheet.tsx:922`) takes the current form value + the loaded pin value and decides which `PinControl` state to render:
    - pin exists, value matches → `pinned` (click unpins)
    - value present, doesn't match pin → `pinnable` (click pins, replacing the old)
    - pin exists, value is empty → **hidden** (the user has explicitly opted out of the pin for this entry; the button would otherwise read "Pinned" while the form shows "No event" and clicking would silently destroy a team-wide default).
    - no value, no pin → hidden.
- `available={!pinState.isPersonal}` hides every FieldPin on `/s/me` since pins don't apply there in v1.
- `canPin={canEdit}` on envelope/event fields renders the button disabled for viewers; account fields use `canPin={true}` since any member can manage their own per-user pin.
- Hydration `useEffect` per form runs once after `pinState.pins` loads, supersedes the legacy `lastAccountKey` localStorage fallback when a pin exists.
- Expense form's envelope chip (`NewTransactionSheet.tsx:1675`) gained a third meta state: `pinned` (alongside `category default` / `overridden`). The category→envelope auto-overwrite at line ~1538 is suppressed when `envelopePinnedAndActive` is true. The chip is also visible without a category selected when an envelope pin has hydrated — otherwise the `EnvelopeStatusCard` would render an overspend warning with no chip to attribute it to.

### EventSelect stale-row handling

`EventSelect` (`NewTransactionSheet.tsx:967`) injects a `"Closed" badge + name` row at the top of the dropdown when the form's `eventId` value points at a now-closed event (typically a hydrated pin whose event closed after the pin was set). The badge sits inside `.nt-stale-row` with `flex-shrink: 0` so the staleness signal survives the trigger's text-ellipsis on narrow viewports. Pair the surface here with the server-side `requireActive: true` guard in transaction create paths — the form gives the user a way to clear, and the server refuses to land a closed event even if they don't.

## tRPC procedures consumed

Pin feature:
- `pin.listBySpace` — read the `{ account, envelop, event }` trio on form open (used inside `usePins`). Real-space only.
- `pin.set` / `pin.clear` — mutations fired by `FieldPin`. Server gating: account = any member; envelope/event = owner|editor.

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
