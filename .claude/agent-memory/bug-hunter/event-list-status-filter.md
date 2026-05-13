---
name: event-list-status-filter
description: event.listBySpace does not filter by status, so closed events leak into transaction-entry pickers — common "close didn't persist" false-positive.
type: project
---

`apps/server/src/procedures/event/listBySpace.mts` returns every row for a space regardless of `status`. The transaction-entry pickers (`NewTransactionSheet`, `EditTransactionSheet`, `TransactionsPage` filter, `usePins`, `OverviewPage`) all consume it directly.

**Why:** Migration `038_event_lifecycle_and_estimate.mts` explicitly documents "Closed events are hidden from the transaction-entry picker" and even ships partial index `idx_events_space_status_active … WHERE status = 'active'` for exactly this filter — but the procedure was never updated to use it. When a user closes an event via `event.setStatus`, the DB row updates correctly, but the picker still shows the event, which looks like "close didn't persist."

**How to apply:** Any time a bug is reported about events "not closing" or "still appearing after closed," check `listBySpace.mts` first — it almost certainly hasn't gotten the `where("status", "=", "active")` clause yet. Also audit the server-side create paths (`transaction/create.mts`, `allocation/create.mts`) to ensure they pass `requireActive: true` to `resolveEventBelongsToSpace`, because the picker filter alone is cosmetic if the server still accepts closed-event IDs.
