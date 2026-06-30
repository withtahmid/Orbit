# Reuse the Spending-Trends filter bar + add a Flatten toggle to Spending-by-category

## Context

The **Spending Trends** analytics page (`apps/web/src/pages/space/analytics/views/TrendsView.tsx`) has a polished filter bar — three independent multi-selects (**Envelopes / Accounts / Categories**) whose state lives in URL params (`env`/`acc`/`cat`) so links are shareable. The user wants to **reuse that exact component** on two other analytics pages:

1. **Spending by category** (`CategoriesView.tsx`) — but with only **Envelopes + Accounts** (decided: the category tree drill IS the category navigation, and the page already owns the `cat` URL param for its drill focus, which would collide with the filter's category param).
2. **Spending calendar** (`HeatmapView.tsx`) — all three filters.

Separately, the user wants a **Flatten toggle** on Spending-by-category. Default behaviour (drill into the category tree) must stay **exactly as-is**. When toggled on, the page shows **one ranked row per category that has direct spend, at any depth** (parents-with-direct-spend AND leaves) — a single long list whose rows sum to the exact grand total — instead of forcing the user to drill level by level.

The filter components are currently **inline and private** inside `TrendsView.tsx`, and the two server procedures these pages call (`categoryBreakdown`, `spendingHeatmap`) accept **no filter inputs** yet. So the work is: extract the filter into a shared module, teach the two procedures (+ their personal twins) to filter, wire the two pages, and add the flatten view.

---

## Part A — Extract the filter into a shared, reusable module (web)

Today `TrendsView.tsx` holds `TrendsFilterBar`, `ChipMultiSelect`, `CategoryMultiSelect`, `FilterSummaryLine`, the `NamedItem`/`CategoryRow`/`CategoryNode` types, the `FilterKey` type, and the local `isUuid`/`UUID_RE` helpers (lines ~50, ~1581–2078), plus the URL-param read/write logic inside the component body (lines ~119–164).

**New file `apps/web/src/pages/space/analytics/components/AnalyticsFilterBar.tsx`:**
- Move `ChipMultiSelect`, `CategoryMultiSelect`, `FilterSummaryLine`, `NamedItem`, `CategoryRow`, `CategoryNode` verbatim (they're self-contained — they import `trpc`, `EntityAvatar`, dropdown/Input/Button UI, lucide icons, `cn`).
- Rename `TrendsFilterBar` → **`AnalyticsFilterBar`**, and add a `dimensions` prop:
  ```ts
  dimensions?: { envelopes?: boolean; accounts?: boolean; categories?: boolean }; // default all true
  ```
  Render each multi-select only when its dimension is enabled (combined with the existing `!isPersonal` rule for envelopes/categories). `FilterSummaryLine` already no-ops empty dims, so passing it the full set is safe.

**New file `apps/web/src/pages/space/analytics/components/useAnalyticsFilters.ts`:**
- Move `UUID_RE`/`isUuid` here (export `isUuid` for reuse).
- A hook `useAnalyticsFilters(opts?: { categories?: boolean })` that owns the `useSearchParams` read/write currently inlined in TrendsView:
  - reads `env`, `acc`, and (only when `opts.categories !== false`) `cat` via `params.getAll(key).filter(isUuid)`;
  - returns `{ envelopeIds, accountIds, categoryIds, envelopeIdsArg, accountIdsArg, categoryIdsArg, setFilterIds, clearAllFilters, hasAnyFilter }` (the `*Arg` values are `undefined` when empty, exactly as TrendsView does today at lines 160–164);
  - **when `categories === false` the hook never reads, writes, or clears `cat`** — leaving that param free for CategoriesView's drill focus (no collision).

**Refactor `TrendsView.tsx`:** delete the moved code; import `AnalyticsFilterBar` + `useAnalyticsFilters` and use them. Behaviour must be byte-for-byte identical (all three dims, same params). This de-dupes ~450 lines.

---

## Part B — Add filter inputs to the server procedures

Reuse the existing helpers in `apps/server/src/procedures/analytics/utils/trendsFilters.mts` (`trendsFilterInputShape`, `selectedCategoriesCTEClause`, `categoryFilterWhere`, `envelopeFilterWhere`, `scopeAccountsFilter`, `intersectAccountIds`). The canonical application pattern is `trendsDailyComparison.mts` (lines 110–205).

**`categoryBreakdown.mts`:**
- Add `...trendsFilterInputShape` to the Zod input.
- Change `WITH RECURSIVE tree AS (…)` to begin with `WITH RECURSIVE ${selectedCategoriesCTEClause(input.categoryIds, [input.spaceId])} tree AS (…)`.
- Add a `scope_accounts AS (SELECT account_id FROM space_accounts WHERE space_id = ${input.spaceId} ${scopeAccountsFilter(input.accountIds)})` CTE.
- In `spending_rows`, alias the table (`FROM transactions t`), and append `AND t.source_account_id IN (SELECT account_id FROM scope_accounts) ${envelopeFilterWhere(input.envelopeIds)} ${categoryFilterWhere(input.categoryIds)}`. (Filter fragments use the `t.` alias — that's why the alias is required.)

**`spendingHeatmap.mts`:**
- Add `...trendsFilterInputShape`. Prepend the query with `WITH RECURSIVE ${catCTE}` (change `WITH` → `WITH RECURSIVE`).
- Add `${scopeAccountsFilter(input.accountIds)}` inside the existing `scope_accounts` CTE.
- Alias both UNION branches (`FROM transactions t`) and append `${envelopeFilterWhere} ${categoryFilterWhere}` to **both**. On the transfer branch the category predicate (`t.expense_category_id IN …`) is naturally false when a category filter is active, so transfers drop out — matching Trends semantics.

**Personal twins** (`procedures/personal/categoryBreakdown.mts`, `procedures/personal/spendingHeatmap.mts`):
- On `/s/me`, only **accounts** is filterable (envelopes/categories are space-scoped and hidden). Add `accountIds` to the input and apply `intersectAccountIds(owned, input.accountIds)`, short-circuiting to `[]` when the intersection is empty (the helper's documented contract — see `personalSpendingHeatmap` ownership pattern). Do **not** add envelope/category inputs to the personal twins.

No migration and no `generate-types` run — these are query/input-shape changes only.

---

## Part C — Wire Spending-by-category (`CategoriesView.tsx`)

1. **Filters:** `const f = useAnalyticsFilters({ categories: false })`. Pass `f.envelopeIdsArg` / `f.accountIdsArg` into both `categoryBreakdown` queries (current + prev) and the account arg into both personal twins. Render `<AnalyticsFilterBar dimensions={{ categories: false }} spaceId={space.id} isPersonal={space.isPersonal} envelopeIds={f.envelopeIds} accountIds={f.accountIds} categoryIds={[]} onChange={f.setFilterIds} onClearAll={f.clearAllFilters} hasAnyFilter={f.hasAnyFilter} />` as the first child block (above the breadcrumb), matching how Trends positions it.

2. **Flatten toggle:** persist in URL as `?flat=1` (independent of the `cat` drill focus). Add a small segmented "Tree / Flat" control in the layout `actions` next to `<PeriodChip />`.

3. **Flat rendering** (only when `flat` is on; leave the entire existing drill path untouched when off):
   - Build `flatRows` = all `rows` with `directTotal > 0`, mapped into the existing `RankRow` shape: `value = directTotal`, `prevValue = prevById.get(id)?.directTotal ?? 0`, `drillable = false`, `onClick → navigate(spaceTransactions?category=id)`. Sort desc by value.
   - **Subtitle = ancestor path** (e.g. `Food › Dining`) computed by walking `parentId` through the existing `byId` map; reuse the `envelopeName` subtitle slot in the row markup to show this path instead.
   - Reuse the existing **ranked-list** markup as-is (it already renders `RankRow[]`). Build `donutData` from the top ~12 `flatRows` (`drillable: false`); `onSelect` routes to filtered transactions.
   - Recompute the KPI strip / center value from `flatRows` (total = Σ directTotal = grand total; count = number of spending categories; largest share; MoM vs previous grand total).
   - In flat mode, hide the drill breadcrumb pill (or replace with a simple "Flat · N categories" line) and ignore `focusId`.

The flat view needs **no new server query** — `categoryBreakdown` already returns every category's `directTotal`; flattening is a pure client-side reshape that respects the active Envelope/Account filters automatically.

---

## Part D — Wire Spending calendar (`HeatmapView.tsx`)

1. `const f = useAnalyticsFilters()` (all three dims; on personal only accounts is effective).
2. Thread `f.envelopeIdsArg`/`f.accountIdsArg`/`f.categoryIdsArg` into `analytics.spendingHeatmap`, and `f.accountIdsArg` into `personal.spendingHeatmap`.
3. Render `<AnalyticsFilterBar spaceId={space.id} isPersonal={space.isPersonal} envelopeIds={f.envelopeIds} accountIds={f.accountIds} categoryIds={f.categoryIds} onChange={f.setFilterIds} onClearAll={f.clearAllFilters} hasAnyFilter={f.hasAnyFilter} />` as the first child block.
4. The derived cards (**by weekday**, **heaviest weeks**, **peak day**, KPI) all compute from `q.data`, so they reflect the filter automatically — no extra changes.
5. **Deliberate scope decision:** leave the `recurring` ("monthly bill dots") query **unfiltered** — recurring detection is a global heuristic overlay, not part of the filtered total. Note this in the PR description as a possible follow-up.

---

## Files touched

- **New:** `apps/web/src/pages/space/analytics/components/AnalyticsFilterBar.tsx`, `apps/web/src/pages/space/analytics/components/useAnalyticsFilters.ts`
- **Web edits:** `TrendsView.tsx` (refactor to imports), `CategoriesView.tsx` (filters + flatten), `HeatmapView.tsx` (filters)
- **Server edits:** `analytics/categoryBreakdown.mts`, `analytics/spendingHeatmap.mts`, `personal/categoryBreakdown.mts`, `personal/spendingHeatmap.mts`

## Verification

1. `pnpm check-types` (root) — confirms the cross-app tRPC input types line up after the procedure-input changes.
2. Run the app (`pnpm dev` / docker-compose), `pnpm seed` for demo data, then:
   - **Trends** (`/s/:id/analytics/trends`) — confirm the filter bar still works identically (all three dims, URL params, clear-all).
   - **Categories** (`/s/:id/analytics/categories`) — Envelopes/Accounts filters narrow the breakdown; **Tree** mode drills exactly as before; **Flat** mode lists every direct-spend category, rows sum to the grand total (cross-check the KPI "Total"), subtitles show the parent path, and a row click lands on filtered transactions. Filters + flat compose.
   - **Calendar** (`/s/:id/analytics/heatmap`) — all three filters change the day intensities, weekday/heaviest-weeks/peak cards track the filtered totals; recurring dots intentionally unchanged.
   - **`/s/me`** for Categories + Calendar — only the Accounts filter shows and works; no envelope/category filter leaks in.
3. Spot-check one filtered total against the matching `transactions` list to confirm the SQL filters match the UI.
