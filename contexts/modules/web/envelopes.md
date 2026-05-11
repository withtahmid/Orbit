# Envelopes (web)

> Per-period envelope grid (allocation buckets) with overspend detection, borrow-from-next-month support, and a per-envelope detail page covering allocations history, transactions, and borrow ledger.

## Route(s)
- List: `ROUTES.spaceEnvelopes(id)` -> `/s/:spaceId/envelopes` (`apps/web/src/router/routes.ts:16`).
- Detail: `ROUTES.spaceEnvelopeDetail(id, envId)` -> `/s/:spaceId/envelopes/:envelopeId` (`apps/web/src/router/routes.ts:17`).
- Lazy-imported in `apps/web/src/router/index.tsx:29-30`, mounted at `apps/web/src/router/index.tsx:163-170` under `SpaceLayout`.
- Guards: `ProtectedRoute` -> `CurrentSpaceProvider` -> `SpaceLayout`. Real-space only: neither page checks `isPersonal`, so the SpaceLayout sidebar hides the Envelopes tab in personal mode (`apps/web/src/layouts/SpaceLayout.tsx:74-77`).

## Files
- `apps/web/src/pages/space/envelopes/EnvelopesPage.tsx` (~2400 lines) — list. Contains the page itself plus inlined dialogs/modals: create/edit envelope (`:1379-1418`), delete confirm (`:1623`), archive toggle (`:1663-1680`), reckoning banner, unbudgeted-trend mini-chart, and `EV_STYLES` CSS.
- `apps/web/src/pages/space/envelopes/EnvelopeDetailPage.tsx` (~1096 lines) — detail. Same orbit-design CSS scope; includes allocations history, borrow ledger with undo, archive toggle.
- Feature dialogs consumed:
  - `apps/web/src/features/allocations/EnvelopeAllocateDialog.tsx` — allocate from an account.
  - `apps/web/src/features/allocations/EnvelopeMoveDialog.tsx` — move between envelopes via `allocation.transfer`.
  - `apps/web/src/features/allocations/EnvelopeTopUpDialog.tsx` — top-up via transfer or `envelop.borrowFromNextMonth`.

## tRPC procedures consumed
List page (`EnvelopesPage.tsx`):
- `analytics.envelopeUtilization` — main data source: per-envelope `{ allocated, consumed, remaining, carryIn, borrowedOut, archived, cadence }` for the active period (`:147-151`).
- `analytics.priorityBreakdown` — totals by priority bucket (`:153-157`).
- `analytics.spaceSummary` — period summary for the topbar (`:159-163`).
- `reckoning.listPending` — reckoning banner (`:936`).
- `analytics.unbudgetedTrend` — used in a sub-card (`:989`).
- Mutations: `envelop.create`, `envelop.update`, `envelop.delete`, `envelop.archive`, `envelop.listBorrows` (`:1402,1411,1624,1670,1666`).

Detail page (`EnvelopeDetailPage.tsx`):
- `analytics.envelopeUtilization` for the current period (`:34`).
- `envelop.allocationListBySpace` — allocations table (`:39`).
- `account.listBySpace` — source-account picker (`:42`).
- `envelop.allocationDelete` (`:80`).
- `envelop.listBorrows` + `envelop.undoBorrow` (`:95,100`).
- `analytics.envelopeHistory` (`:128`).
- `envelop.archive` (`:583`).

## State & mutations
- List: local state `monthOffset` (period navigator), `query` (debounced 200ms), `view` ("grouped" / "list" / "grid"), `sort` (`cadence` / `urgency` / `remaining` / `spent` / `name`), `showArchived`. `now`, `viewingDate`, `periodStart`, `periodEnd` derive via `addMonths` + `startOfMonth` / `endOfMonth`.
- Common invalidation pattern across all mutations: invalidate `envelop.listBySpace`, `analytics.envelopeUtilization`, `analytics.spaceSummary`, and (for allocation mutations) `analytics.accountAllocation` (e.g. `EnvelopesPage.tsx:1396-1402`, `EnvelopeAllocateDialog.tsx:75-79`).
- Borrow flow:
  - `EnvelopeTopUpDialog` chooses between `allocation.transfer` (top-up from another envelope) and `envelop.borrowFromNextMonth`.
  - List page surfaces `borrowedOut` in an attention badge.
  - Detail page renders the active borrows from `envelop.listBorrows` with undo via `envelop.undoBorrow`.
- Permission gating:
  - Create/edit envelope: `PermissionGate roles={["owner"]}` (`EnvelopesPage.tsx:295,560`).
  - Allocate / move / top-up dialogs: `PermissionGate roles={["owner","editor"]}` (`EnvelopeDetailPage.tsx:203,261`).
  - Archive / delete: `PermissionGate roles={["owner"]}` (`EnvelopeDetailPage.tsx:278,286`, `EnvelopesPage.tsx:881`).

## Conventions & gotchas
- An envelope row's "spendable this period" is `allocated + carryIn`; overspend computed by `buildAttention` (`EnvelopesPage.tsx:110-132`). `borrowedOut` is shown separately — it means "future periods owe this much" and surfaces in the reckoning flow.
- `archived` envelopes are filtered out of the main list by default and totals (`:174-181`) — they have no current activity because the server blocks new transactions/allocations on them.
- The period navigator only moves whole months; queries always pass `startOfMonth` / `endOfMonth` of the offset date — don't pass arbitrary ranges.
- `cadence` is `"monthly"` or `"none"` — `none` envelopes get grouped separately in the "grouped" view (`groupByCadence`, `:103-108`).
- `sortEnvelopes` defaults to "cadence" — that puts monthly envelopes first; "urgency" sorts by `consumed/allocated` ratio.

## Cross-references
- Server: `apps/server/src/procedures/envelop/*` plus `analytics.envelopeUtilization` / `envelopeHistory` / `unbudgetedTrend`.
- Web: reckoning flow at `pages/space/reckoning/ReckoningPage.tsx` invalidates the same caches; `pages/space/plan/PlanMonthPage.tsx` writes via `envelop.allocationCreate`; the allocation move/top-up dialogs are shared with PlanDetail.
