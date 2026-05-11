# Reckoning (web)

> End-of-month overspend reconciliation: lists every past-month envelope that finished over plan and forces the user to choose a resolution — pull from another envelope, borrow from next month, or absorb (acknowledge only). In personal mode it aggregates across every space the user is in.

## Route(s)
- Path: `ROUTES.spaceReckoning(id)` -> `/s/:spaceId/reckoning` (`apps/web/src/router/routes.ts:19`).
- Lazy-imported in `apps/web/src/router/index.tsx:32`, mounted at `apps/web/src/router/index.tsx:175-178` under `SpaceLayout`.
- Guards: `ProtectedRoute` -> `CurrentSpaceProvider` -> `SpaceLayout`. Personal-aware: the page dispatches at the top — `if (space.isPersonal) return <PersonalReckoning />; return <PerSpaceReckoning />` (`ReckoningPage.tsx:38-42`). Not in the sidebar nav — users reach it from the Overview banner or the envelopes page.

## Files
- Main page: `apps/web/src/pages/space/reckoning/ReckoningPage.tsx` (~783 lines). Three components in one file:
  - `ReckoningPage` (`:38`) — dispatcher between personal and per-space variants.
  - `PerSpaceReckoning` (`:44`) — main per-space resolution UI.
  - `ReckoningRow` (`:233`) — per-row state machine (pull / borrow / absorb) used by the per-space view.
  - `PersonalReckoning` (`:654`) — cross-space aggregator grouped by space, with "Settle in [Space]" links back to each space's reckoning page.
- Page-local CSS lives in `RK_STYLES` at the bottom; wraps in `.orbit-design rk-root`.

## tRPC procedures consumed
Per-space (`PerSpaceReckoning`):
- `reckoning.listPending` — pending overspends for this space (`:49`).
- `analytics.envelopeUtilization` — hoisted once, scoped to the current calendar month, used to populate the "pull from" candidate list per row (`:60-64`). Avoids the previous N-queries-per-row pattern.
- Mutations:
  - `reckoning.acknowledge` (`:79,260`) — records a resolution (`"absorbed" | "borrowed" | "pulled"`).
  - `envelop.borrowFromNextMonth` (`:80`) — the "borrow" path.
  - `allocation.transfer` (`:261`) — the "pull" path; transfers allocation from a chosen source envelope.

Personal (`PersonalReckoning`):
- `personal.reckoning.listPending` (`:655`) — cross-space pending items with `spaceId` + `spaceName` annotations.
- No mutations: this view only links out to per-space reckoning pages.

## State & mutations
- Per-space local state: `busyId` (single in-flight row key built from `envelopId-periodStart`, or `"ALL"` for the bulk absorb), per-row `pullSourceId` and `pulling` inside `ReckoningRow`.
- Page state machine:
  1. Show pending items from `reckoning.listPending`.
  2. User picks resolution per row -> mutation chain runs, then `refresh()` invalidates and re-fetches.
  3. The "Absorb everything" button iterates `acknowledge` over every pending item then navigates back to envelopes (`:141-161`).
- `refresh()` invalidates `reckoning.listPending` + `analytics.envelopeUtilization` + `analytics.spaceSummary` + `analytics.unbudgetedTrend` (`:84-93`).
- Pull flow (`ReckoningRow.handlePull`, `:268-294`): `allocation.transfer({ from: { kind: "envelop", envelopId: source }, to: { kind: "envelop", envelopId: target }, amount: overBy })` then `acknowledge({ resolution: "pulled" })`. Both calls use rotating idempotency keys via `useIdempotencyKey()`.
- Borrow flow (`handleBorrow`, `:116-139`): `envelop.borrowFromNextMonth` then `acknowledge({ resolution: "borrowed" })`.
- Absorb flow (`handleAbsorb`, `:97-114`): `acknowledge({ resolution: "absorbed" })` only.
- Permission gating: NONE in this page. Reckoning resolution is treated as an inherent owner/editor action; the assumption is that viewers don't see the link.

## Conventions & gotchas
- The candidate list for "pull from" is derived from `envelopeUtilization` rows where `remaining > 0 && !archived` (`:65-77`) and filtered to exclude the overspent envelope itself (`:251-253`). If there are zero candidates the "Pull" option is hidden entirely — only borrow/absorb remain.
- `periodStart` is sent as a `Date` object to `reckoning.acknowledge`, but the cache key in `busyId` uses the raw ISO string from the row — don't conflate them.
- `crypto.randomUUID()` is used inline for the absorb/borrow idempotency keys (`:106,124,130,150`), while the pull/ack pair in `ReckoningRow` uses `useIdempotencyKey()` with `.rotate()` for cleaner reuse — both patterns coexist.
- The personal view never executes resolutions; rows are read-only and each space gets a "Settle in [Space]" link to its own per-space reckoning page (`:735-741`).
- The Overview's `ReckoningOverviewBanner` queries the same procs (`reckoning.listPending` or `personal.reckoning.listPending`) and links here.

## Cross-references
- Server: `apps/server/src/procedures/reckoning/*`, `apps/server/src/procedures/envelop/borrowFromNextMonth.mts`, `apps/server/src/procedures/allocation/transfer.mts`; personal twin in `apps/server/src/procedures/personal/reckoning/*`.
- Web: invalidations overlap with `pages/space/envelopes/EnvelopesPage.tsx` and `features/allocations/EnvelopeTopUpDialog.tsx`; the personal aggregator mirrors how `pages/space/year/YearReportPage.tsx` handles cross-space unioning.
