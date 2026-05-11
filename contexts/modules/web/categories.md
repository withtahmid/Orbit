# Categories (web)

> The category tree page — every expense category, pinned to an envelope, with usage-this-period and a trend delta vs the prior identical-length period. Tree-shaped CRUD (create, rename, re-parent, re-pin, delete).

## Route(s)
- Path: `ROUTES.spaceCategories(id)` -> `/s/:spaceId/categories` (`apps/web/src/router/routes.ts:23`).
- Lazy-imported in `apps/web/src/router/index.tsx:36`, mounted at `apps/web/src/router/index.tsx:191-194` under `SpaceLayout`.
- Guards: `ProtectedRoute` -> `CurrentSpaceProvider` -> `SpaceLayout`. Real-space only — `SpaceLayout` hides the Categories tab in personal mode (`apps/web/src/layouts/SpaceLayout.tsx:74-77`).

## Files
- Main page: `apps/web/src/pages/space/categories/CategoriesPage.tsx` (~1917 lines). One big file containing the tree component, the period selector chip, all four mutation dialogs (create, edit, change parent, change envelop), and the inline `CA_STYLES` CSS. Wraps in `.orbit-design ca-root`.

## tRPC procedures consumed
- `envelop.listBySpace` — list of envelopes for the "pinned envelope" selector (`:177`).
- `expenseCategory.listBySpaceWithUsage` — flat list with `{ spent_total, tx_count, parent_id, envelopId, priority, ... }` for the current period (`:180`).
- `expenseCategory.listBySpaceWithUsage` again for the previous identical-length period to compute trend deltas (`:197`); `prevById` keyed map at `:202-206`.
- Mutations:
  - `expenseCategory.create` (`:914`).
  - `expenseCategory.update` (`:1285`) — rename + color/icon + priority.
  - `expenseCategory.delete` (`:793`).
  - `expenseCategory.changeParent` (`:1436`) — re-parent in the tree.
  - `expenseCategory.changeEnvelop` (`:1541`) — re-pin to a different envelope.

## State & mutations
- Period state from `usePeriod()` (URL-persisted). Trend delta is computed against an "equal-span" window immediately before the current period (`:188-201`).
- Tree assembly: `buildTree` flattens the parent_id graph into roots + children with subtree spend/tx counts; `maxDepth` controls the chevron expand affordance.
- Totals aggregate per priority (`essential` / `important` / `discretionary` / `luxury`) using effective-priority inheritance — children inherit the nearest ancestor's `priority` (`:222-241`).
- Every mutation runs `useInvalidateAnalytics(space.id)` (`@/lib/invalidate`) instead of hand-listing caches — this batches the cross-cutting invalidations the page needs (`:788,912,1284,1435,1540`).
- Permission gating: `PermissionGate roles={["owner"]}` on every mutation CTA — create (`:270`), edit/delete row actions (`:606`).

## Conventions & gotchas
- A category MUST be pinned to an envelope — `changeEnvelop` is mandatory at create time and the row dropdown surface it as the primary action.
- `priority` is optional per category; rendering uses *effective* priority via parent walk. Don't sum `byPriority` over leaves only — every node's `spent_total` contributes (`:235-238`).
- Trend deltas hide when the previous-period span is empty; `prevById` returns `0` for missing keys, so render gating should check both the current and prev totals.
- `useInvalidateAnalytics` is preferred here over hand-listing tRPC caches because tree edits cascade through several analytics surfaces (envelope utilization, priority breakdown, recent transactions).
- Tree edits use `OrbitModalShell` / `OrbitField` from `@/components/orbit/OrbitModalShell` — keep new dialogs on the same shell so the visual language stays consistent inside this page.

## Cross-references
- Server: `apps/server/src/procedures/expenseCategory/*`.
- Web: `pages/space/envelopes/*` consumes the envelopes side of the pinning relation; `lib/invalidate.ts` centralizes the cross-cutting cache-bust set used here.
