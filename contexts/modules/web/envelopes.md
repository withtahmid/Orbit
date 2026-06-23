# Envelopes (web)

> Per-period envelope/budget grid (space-wide allocation buckets) with overspend detection, and a per-envelope detail page covering current-period utilization and transactions. Overspend is shown, never blocked; transfer-between-envelopes is the recovery path.

## Route(s)
- List: `ROUTES.spaceBudgets(id)` -> `/s/:spaceId/budgets` (`apps/web/src/router/routes.ts:16`).
- Detail: `ROUTES.spaceBudgetDetail(id, envId)` -> `/s/:spaceId/budgets/:envelopeId` (`apps/web/src/router/routes.ts:17`).
- Month allocator: `ROUTES.spaceBudgetMonth(id, month)` -> `/s/:spaceId/budgets/month/:month` (`apps/web/src/router/routes.ts:18`).
- Lazy-imported in `apps/web/src/router/index.tsx:30-32`, mounted at `apps/web/src/router/index.tsx:164-173` under `SpaceLayout`.
- Guards: `ProtectedRoute` -> `CurrentSpaceProvider` -> `SpaceLayout`. Real-space only: neither page checks `isPersonal`, so the SpaceLayout sidebar hides the Budgets tab in personal mode (`apps/web/src/layouts/SpaceLayout.tsx:74-77`).

## Files
- `apps/web/src/pages/space/budgets/BudgetsPage.tsx` (~2650 lines) — list. Contains the page itself plus inlined dialogs/modals: create/edit envelope, delete confirm, archive toggle, unbudgeted-trend mini-chart, an `EnvelopeTargetDatePicker` for goal targets, and the page CSS.
- `apps/web/src/pages/space/budgets/BudgetDetailPage.tsx` (~827 lines) — detail. Same orbit-design CSS scope; current-period utilization, transactions list, allocate/move/top-up dialogs, archive/unarchive toggle.
- `apps/web/src/pages/space/budgets/BudgetMonthPage.tsx` (~1072 lines) — per-month allocator (allocate across envelopes for a chosen month).
- Feature dialogs consumed (all under `apps/web/src/features/allocations/`):
  - `EnvelopeAllocateDialog.tsx` — allocate from an account (accumulating upsert via `envelop.allocationCreate`).
  - `EnvelopeMoveDialog.tsx` — move between envelopes via `allocation.transfer`.
  - `EnvelopeTopUpDialog.tsx` — top up an overspent envelope by pulling from another envelope via `allocation.transfer` (transfer-only; no borrow path).

## tRPC procedures consumed
List page (`BudgetsPage.tsx`):
- `analytics.envelopeUtilization` — main data source: per-envelope `{ allocated, consumed, remaining, archived, cadence }` for the active period (`:201`). `remaining = allocated − consumed`.
- `analytics.priorityBreakdown` — totals by priority bucket (`:207`).
- `analytics.spaceSummary` — period summary for the topbar (`:213`).
- `analytics.unbudgetedTrend` — used in a sub-card (`:1202`).
- Mutations: `envelop.create`, `envelop.update`, `envelop.delete`, `envelop.archive` (`:1599,1608,1854,1894`).

Detail page (`BudgetDetailPage.tsx`):
- `analytics.envelopeUtilization` for the current period (`:33`).
- `transaction.listBySpace` — the envelope's transactions (`:41`).
- `envelop.archive` — archive/unarchive (`:428`).

## State & mutations
- List: local state `monthOffset` (period navigator), `query` (debounced 200ms), `view` ("grouped" / "list" / "grid"), `sort` (`cadence` / `urgency` / `remaining` / `spent` / `name`), `showArchived`. `now`, `viewingDate`, `periodStart`, `periodEnd` derive via `addMonths` + `startOfMonth` / `endOfMonth`.
- Common invalidation pattern across allocation mutations: invalidate `envelop.allocationListBySpace`, `analytics.envelopeUtilization`, and `analytics.spaceSummary` (e.g. `EnvelopeAllocateDialog.tsx:76-78`, `EnvelopeTopUpDialog.tsx:118-126`).
- Top-up flow:
  - `EnvelopeTopUpDialog` pulls planned funds from another active envelope with positive remaining via `allocation.transfer` — no money leaves any account. This is the primary overspend remedy.
- Permission gating:
  - Create/edit envelope: `PermissionGate roles={["owner"]}` (BudgetsPage).
  - Allocate / move / top-up dialogs: `PermissionGate roles={["owner","editor"]}` (BudgetDetailPage).
  - Archive / delete: `PermissionGate roles={["owner"]}` (BudgetsPage / BudgetDetailPage).

## Conventions & gotchas
- An envelope row's spendable amount this period is just `allocated`; `remaining = allocated − consumed`. There is **no carry-over and no borrowing** — monthly envelopes reset each period, rolling/goal (`cadence='none'`) envelopes accumulate as a lifetime pool. Overspend (`remaining < 0`) is **shown** in the UI, never blocked or nagged; the recovery path is transfer-between-envelopes (`allocation.transfer`).
- Allocations are **space-wide**: one absolute row per (envelope, period) — one per month for monthly envelopes, one lifetime row (`period_start` NULL) for rolling/goal. Allocate/deallocate is an accumulating upsert; the `amount` is the absolute allocated total, not a delta.
- Goals are `cadence='none'` envelopes with an optional `target_amount` / `target_date` (set via `EnvelopeTargetDatePicker`).
- `archived` envelopes are filtered out of the main list by default and totals — they have no current activity because the server blocks new transactions/allocations on them.
- The period navigator only moves whole months; queries always pass `startOfMonth` / `endOfMonth` of the offset date — don't pass arbitrary ranges.
- `cadence` is `"monthly"` or `"none"` — `none` envelopes get grouped separately in the "grouped" view.

## Cross-references
- Server: `apps/server/src/procedures/envelop/*` plus `analytics.envelopeUtilization` / `unbudgetedTrend`.
- Web: `pages/space/budgets/BudgetMonthPage.tsx` writes via `envelop.allocationCreate`; the allocate/move/top-up dialogs under `features/allocations/*` are shared between the budgets list and detail pages.
