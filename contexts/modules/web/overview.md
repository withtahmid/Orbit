# Overview (web)

> Space dashboard at `/s/:spaceId` — a multi-card editorial view of position, flow, allocation, plans, events, and reckoning that swaps to a cross-space personal variant under `/s/me`.

## Route(s)
- Path: `ROUTES.spaceOverview(id)` / `ROUTES.space(id)` — both resolve to `/s/:spaceId` (index route, see `apps/web/src/router/routes.ts:11-12`).
- Lazy-imported in `apps/web/src/router/index.tsx:25` and mounted as the index child of `SpaceLayout` (`apps/web/src/router/index.tsx:150`).
- Guards: `ProtectedRoute` -> `CurrentSpaceProvider` -> `SpaceLayout`. The page detects the virtual personal space via `space.isPersonal` (set by `CurrentSpaceProvider` when `spaceId === "me"`).

## Files
- Main page: `apps/web/src/pages/space/OverviewPage.tsx` (~4361 lines; defines every card inline plus the `OV_STYLES` block, the `TodayBand`, `PersonalSpaceBand`, `ReckoningOverviewBanner`, and many derived chart components).
- Pulls `CumulativeRaceChart` from the analytics view at `apps/web/src/pages/space/analytics/views/TrendsView.tsx:576` to render the trends mini-chart.
- Reuses `MetricToggle` / `useMetricMode` from `apps/web/src/components/shared/MetricMode.tsx` for the cash-vs-operational toggle (URL-persisted via `?metric=`).

## tRPC procedures consumed
All real-space procs and their personal twins are toggled with `{ enabled: !isPersonal }` / `{ enabled: isPersonal }`:
- `analytics.spaceSummary` + `personal.summary` — period totals for this and last month (`OverviewPage.tsx:41-59`).
- `analytics.cashFlow` + `personal.cashFlow` — weekly cash-flow buckets (`:61-69`).
- `analytics.balanceHistory` + `personal.balanceHistory` — 30-day balance trend (`:71-79`).
- `analytics.envelopeUtilization` + `personal.envelopeUtilization` — month-period envelopes for top-categories, allocation donut, and borrow banner (`:96-104`).
- `analytics.priorityBreakdown` — priority donut, real-space only (`:106-109`).
- `analytics.planProgress` + `personal.planProgress` — plans card (`:111-118`).
- `event.listBySpace` — upcoming events list, real-space only (`:120-123`).
- `personal.spaceBreakdown` — per-space net worth band, personal only (`:127-129`).
- `analytics.accountDistribution` + `personal.accountDistribution` — net-worth composition + accounts at a glance (`:134-141`).
- `analytics.spendingHeatmap` + `personal.spendingHeatmap` — flow calendar (`:144-152`).
- `analytics.todaySummary` + `personal.todaySummary` — top "Today band" (`:155-163`).
- `analytics.categoryWoW` + `personal.categoryWoW` — week-over-week category movers (`:165-174`).
- `analytics.trends.dailyComparison` + `personal.trends.dailyComparison` — spending trends cumulative race (`:182-196`).
- `analytics.incomeBreakdown` + `personal.incomeBreakdown` — income sources (`:198-213`).
- `analytics.recurring` + `personal.recurring` — twice, with `kind: "bill"` and `kind: "subscription"` (`:215-239`).
- `analytics.topMerchants` + `personal.topMerchants` — top merchants (`:241-255`).
- `analytics.netWorthHistory` + `personal.netWorthHistory` — 12-month net-worth sparkline (`:261-281`).
- `reckoning.listPending` + `personal.reckoning.listPending` — used inside `ReckoningOverviewBanner` (`:1036-1040`).

## State & mutations
- Local state: `[now]` frozen at mount, `mode` from `useMetricMode()` (cash vs operational), derived month/period boundaries via `addMonths`, `startOfMonth`, `endOfMonth` (`@/lib/dates`).
- No mutations — the Overview is purely read-only. The "New transaction" CTA in the topbar links into Transactions (`OverviewPage.tsx:440-444`) and is hidden when `isPersonal`.
- No `PermissionGate` usage here; gating happens implicitly because the personal sentinel sets `myRole: "viewer"` (see `CurrentSpaceProvider.tsx:54`) and the page also explicitly hides the New-transaction CTA on personal.

## Conventions & gotchas
- The page wraps everything in `.orbit-design` (`OverviewPage.tsx:420`) and inlines its CSS in the giant `OV_STYLES` template literal at the bottom — do not look for a Tailwind class story.
- "Cash" mode = bank balance view including transfers; "Operational" = true income/expense. Default is operational and the choice persists in `?metric=` via `useMetricMode`. Some tiles always use operational (MoM deltas, `:386-394`) regardless of toggle.
- Personal-twin dispatch is the dominant pattern: every query has a `Space` variant and a `Personal` variant, both declared at the top with `{ enabled }` flags, then `const x = isPersonal ? personal : space` to pick one.
- The borrow obligations banner reads `e.borrowedOut` from `envelopeUtilization` rows (`OverviewPage.tsx:347`) — it replaced the older per-account drift banner.
- `ReckoningOverviewBanner` (defined further down in the same file, ~`:1030`) renders inline for both real spaces and personal; clicking it links to `ROUTES.spaceReckoning("me")` when personal.

## Cross-references
- Server: `apps/server/src/routers/analytics.mts` and `apps/server/src/routers/personal.mts` (every `analytics.X` has a personal twin; see project CLAUDE.md §"Router tree").
- Web: shares `CumulativeRaceChart` with `analytics/views/TrendsView.tsx`; the reckoning banner mirrors `pages/space/reckoning/ReckoningPage.tsx`; donut data flows from the same `envelopeUtilization` proc used by `envelopes/EnvelopesPage.tsx`.
