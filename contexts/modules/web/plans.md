# Plans (web)

> Long-horizon goal-based savings: target amount, accumulated allocations, optional deadline. Renders a list with progress sort plus a per-plan detail page with the allocations ledger.

## Route(s)
- List: `ROUTES.spacePlans(id)` -> `/s/:spaceId/plans` (`apps/web/src/router/routes.ts:21`).
- Detail: `ROUTES.spacePlanDetail(id, planId)` -> `/s/:spaceId/plans/:planId` (`apps/web/src/router/routes.ts:22`).
- Lazy-imported in `apps/web/src/router/index.tsx:34-35`, mounted at `apps/web/src/router/index.tsx:183-190` under `SpaceLayout`.
- Guards: `ProtectedRoute` -> `CurrentSpaceProvider` -> `SpaceLayout`. Real-space only — the personal nav hides the Plans tab (`apps/web/src/layouts/SpaceLayout.tsx:74-77`), so `isPersonal` is not handled inside the pages.

## Files
- `apps/web/src/pages/space/plans/PlansPage.tsx` (~1241 lines) — list page, plus inlined create/edit/delete dialogs at the bottom (`:570-605`, `:1002-1010`) and the page-local `PLANS_STYLES` CSS. Wraps everything in `.orbit-design plans-root`.
- `apps/web/src/pages/space/plans/PlanDetailPage.tsx` (~555 lines) — detail page with hero progress block, allocations table, and contribution CTA.
- Feature dialog consumed: `apps/web/src/features/allocations/PlanAllocateDialog.tsx` — adds a contribution via `plan.allocationCreate`.

## tRPC procedures consumed
List page (`PlansPage.tsx`):
- `analytics.planProgress` — list of plans with `{ allocated, targetAmount, pctComplete, color, icon, name, ... }` (`:55`).
- Mutations: `plan.create`, `plan.update`, `plan.delete` (`:591,602,1003`).

Detail page (`PlanDetailPage.tsx`):
- `analytics.planProgress` — looked up by `planId` for the hero block (`:18`).
- `plan.allocationListBySpace` — the contributions table (`:19`).
- `plan.allocationDelete` — remove a contribution (`:27`).

Feature dialog (`PlanAllocateDialog.tsx`):
- `account.listBySpace` for the source picker (`:48`).
- `plan.allocationCreate` (`:55`).

## State & mutations
- List page: local `sort` state — `"progress"` (default, by `pctComplete`), `"saved"`, `"target"`, `"name"`. Aggregate `totals` derives `{ saved, target, progress, count }` (`PlansPage.tsx:68-76`).
- Invalidation pattern:
  - On plan CRUD (`PlansPage.tsx:585-589, 1006-1008`): invalidate `plan.listBySpace`, `analytics.planProgress`.
  - On allocation create (`PlanAllocateDialog.tsx:60-63`): invalidate `plan.allocationListBySpace`, `analytics.planProgress`, `analytics.spaceSummary`, `analytics.accountAllocation`.
  - On allocation delete (`PlanDetailPage.tsx:30-32`): invalidate `plan.allocationListBySpace`, `analytics.planProgress`, `analytics.spaceSummary`.
- Idempotency keys come from `useIdempotencyKey` for create/contribute flows.
- Permission gating: every mutation CTA is wrapped in `PermissionGate roles={["owner"]}` for create/edit/delete (`PlansPage.tsx:93,177,309`; `PlanDetailPage.tsx:160,187`); contribute via `PlanAllocateDialog` uses `PermissionGate roles={["owner","editor"]}` (`PlansPage.tsx:299`).

## Conventions & gotchas
- Plans are NOT period-scoped — the hero numbers are lifetime, not "this month". `pctComplete` can be `null` when `targetAmount` is null.
- `plan.delete` only succeeds if there are no allocations on the plan (server-enforced). Delete the contributions first via the detail page.
- Sorting is purely client-side over `analytics.planProgress` rows; the procedure returns a stable shape so `useMemo` is cheap.
- The contribute CTA on the detail page links into `PlanAllocateDialog` with the source-account list pre-fetched via `account.listBySpace`.
- The detail page's invalidate set is slightly narrower than the list's — be sure to include `analytics.spaceSummary` whenever you write a new allocation/delete path (it backs the Overview).

## Cross-references
- Server: `apps/server/src/procedures/plan/*`; analytics aggregation in `apps/server/src/procedures/analytics/planProgress.mts`.
- Web: the contribute dialog shares plumbing with `features/allocations/EnvelopeAllocateDialog.tsx`; allocation-list invalidation mirrors envelope allocations in `pages/space/envelopes/EnvelopeDetailPage.tsx`.
