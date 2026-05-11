# Events (web)

> Trip / project / occasion bucket pages — tag transactions to an event to roll up totals across categories. Recently rewritten: new segmented status filter (active / closed / all), estimate progress bar, and a multi-section detail page.

## Route(s)
- List: `ROUTES.spaceEvents(id)` -> `/s/:spaceId/events` (`apps/web/src/router/routes.ts:24`).
- Detail: `ROUTES.spaceEventDetail(id, eventId)` -> `/s/:spaceId/events/:eventId` (`apps/web/src/router/routes.ts:25`).
- Lazy-imported in `apps/web/src/router/index.tsx:37-38`, mounted at `apps/web/src/router/index.tsx:195-202` under `SpaceLayout`.
- Guards: `ProtectedRoute` -> `CurrentSpaceProvider` -> `SpaceLayout`. Real-space only — `SpaceLayout` hides the Events tab in personal mode (`apps/web/src/layouts/SpaceLayout.tsx:74-77`); inside the pages `space.id` is always a real UUID.

## Files
- `apps/web/src/pages/space/events/EventsPage.tsx` (~815 lines) — the list. Contains the page, the `StatusFilterSegmented` component (`:440`), and `YearPicker` (`:471`).
- `apps/web/src/pages/space/events/EventDetailPage.tsx` (~939 lines) — the detail. Top-down: `EventHeaderCard` (`:160`), `BudgetCard` (`:232`), `CategoryBreakdownCard` (`:386`), `TransactionsCard` (`:460`), `AttachmentsCard` (`:582`). Reuses the same `ev-*` orbit-design CSS scope as the list.
- Local helpers:
  - `apps/web/src/pages/space/events/CreateOrEditEventDialog.tsx` — name, dates, color, icon, description, estimated amount; mutations `event.create` / `event.update`.
  - `apps/web/src/pages/space/events/DeleteEventDialog.tsx` — confirm + `event.delete`.
  - `apps/web/src/pages/space/events/EventStatusButton.tsx` — active <-> closed toggle via `event.setStatus`.
  - `apps/web/src/pages/space/events/eventUI.tsx` — shared `DesignIcon`, `EntityAvatar`, `EstimateProgressBar` (`:134`), `Metric`, `Money`, `Skeleton`.
  - `apps/web/src/pages/space/events/types.ts` — `EventTotal` hydrated type, `EventStatus`, `eventCalendarState(start, end, now)` returning `"Past" | "Recent" | "Active" | "Upcoming"` (orthogonal to lifecycle status).

## tRPC procedures consumed
List page (`EventsPage.tsx`):
- `analytics.eventTotals` — every event in the space with expense/income totals, tx count, lifecycle status (`:39`).

Detail page (`EventDetailPage.tsx`):
- `event.getById` — base event record (`:26`).
- `analytics.eventTotals` narrowed via `{ eventId }` — totals row shared with the list card (`:29-32`).
- `analytics.eventCategoryBreakdown` — per-category split (`:34`).
- `file.listForEvent` — attachments card (`:38`).
- `transaction.listBySpace` with `eventId` + cursor pagination — Transactions card (`:45-55`).

Mutations (dialogs):
- `CreateOrEditEventDialog`: `event.create` (`:64`), `event.update` (`:72`). Invalidates `event.listBySpace`, `analytics.eventTotals`, `event.getById`.
- `DeleteEventDialog`: `event.delete` (`:28`). Invalidates `event.listBySpace`, `analytics.eventTotals`, `transaction.listBySpace`, `transaction.filteredTotals`.
- `EventStatusButton`: `event.setStatus` (`:26`). Invalidates `event.listBySpace`, `analytics.eventTotals`, `event.getById`.

## State & mutations
- List local state: `year` (default current year), `statusFilter` (`"all" | "active" | "closed"`). `yearEvents` filters by year overlap (`:51-59`); `counts` per status (`:61-69`); `visibleEvents` applies the status filter (`:71-77`).
- `StatusFilterSegmented` (`:440`) is a three-position pill control showing the count badge per status.
- `YearPicker` (`:471`) shows prev/current/next year plus any year that has at least one event.
- Detail page state: `txCursor` + `accumulated` array for "Load more" pagination (`:43-74`); pagination resets when `eventId` changes.
- Permission gating: `PermissionGate roles={["owner","editor"]}` around create (`EventsPage.tsx:116-127`), the row's quick-action area (`:231,384,423`), and the detail page header (`EventDetailPage.tsx:198,361`).

## Conventions & gotchas
- Two separate state machines: lifecycle (`status: "active" | "closed"`, controlled by users via `EventStatusButton`) and calendar position (`eventCalendarState` derived from start/end vs `now`). The header card shows both — don't confuse them.
- `estimatedAmount` is nullable; `EstimateProgressBar` (`eventUI.tsx:134`) is responsible for the "set an estimate" empty-state — pass `null` rather than rendering a separate placeholder.
- `analytics.eventTotals` is queried twice on the detail page (once narrowed via `{ eventId }`), so the totals row matches what the list card shows.
- The Transactions card uses cursor pagination on `transaction.listBySpace`; `accumulated` dedupes by id (`EventDetailPage.tsx:65-73`) when "Load more" fires.
- Deleting an event invalidates `transaction.listBySpace` because transactions formerly tagged to the event now show "untagged" — keep that invalidation when adding new write paths.

## Cross-references
- Server: `apps/server/src/procedures/event/*` (one-per-file), plus `analytics.eventTotals` and `analytics.eventCategoryBreakdown`.
- Web: file attachments use `file.listForEvent` shared with the file-handling code; `transaction.listBySpace` consumption mirrors `pages/space/transactions/TransactionsPage.tsx` and the per-account view in `accounts/AccountDetailPage.tsx`.
