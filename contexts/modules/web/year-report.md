# Year Report (web)

> Annual honesty surface — per-envelope by-month plan vs actual spend in a single 12-column grid, with year totals and cumulative overspend.

## Route(s)
- Path: `ROUTES.spaceYearReport(id, year)` -> `/s/:spaceId/year/:year` (`apps/web/src/router/routes.ts:20`).
- Lazy-imported in `apps/web/src/router/index.tsx:33`, mounted at `apps/web/src/router/index.tsx:179-182` under `SpaceLayout`.
- Guards: `ProtectedRoute` -> `CurrentSpaceProvider` -> `SpaceLayout`. Personal-aware: dispatches between `analytics.yearReport` and `personal.yearReport` (see below). Not in the sidebar nav; users reach it from envelopes or links elsewhere in the app.

## Files
- Main page: `apps/web/src/pages/space/year/YearReportPage.tsx` (~390 lines). Single file containing the page + the `YR_STYLES` CSS block. Wraps in `.orbit-design yr-root`.

## tRPC procedures consumed
- `analytics.yearReport` with `{ enabled: !space.isPersonal }` (`:50-53`).
- `personal.yearReport` with `{ enabled: space.isPersonal }` (`:54-57`). The personal variant unions every space the user is in and adds a `spaceName` per envelope row to disambiguate (e.g. "Groceries" appearing in two different spaces).

## State & mutations
- URL state only: `:year` route param is parsed into `yearNum` (clamped to `[2000, 2100]`, fallback to the current year) via `useMemo` (`:39-44`).
- Navigation chevrons in the topbar link to `ROUTES.spaceYearReport(space.id, yearNum - 1)` and `+1` (`:79-112`), and are disabled at the clamp boundaries.
- No mutations, no `PermissionGate` usage. The page is purely a read view.

## Conventions & gotchas
- Cell color cues: red when `over > 0`, muted green when `planned > 0 && spent > 0 && spent < planned * 0.5`, otherwise neutral. See `:176-185`. An em-dash renders when both `planned` and `spent` are zero (`:188-203`).
- The personal variant's `spaceName` is read defensively via `(e as { spaceName?: string }).spaceName` (`:144-147`) because the union return type doesn't narrow inside JSX. Don't refactor away the cast without changing the proc signatures.
- Row keys mix `spaceName` and `envelopId` so the same `envelopId` appearing across spaces in personal mode doesn't collide (`:150`).
- Archived envelopes are flagged with an "archived" pill but still listed — they may have had planned/spent activity earlier in the year.
- The 2000–2100 year clamp is intentional — the proc has no data outside this and users shouldn't be able to URL-navigate to absurd years.

## Cross-references
- Server: `apps/server/src/procedures/analytics/yearReport.mts` and `apps/server/src/procedures/personal/yearReport.mts`.
- Web: shares conceptual lineage with the reckoning flow (resolved overspends still show up here) and the envelopes period navigator.
