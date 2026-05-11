---
name: Events domain shape (as of 2026-05-11)
description: How Events are modeled and surfaced in Orbit — table columns, procedures, UI consumers, and personal-space relationship
type: project
---

Events are a per-space, time-bounded grouping concept (think weddings, trips, projects). They tag transactions for aggregate reporting; they are NOT envelopes or plans.

**Why this matters for product decisions:** Events are intentionally lightweight — no lifecycle, no budget, no money flow of their own. When the user asks for "estimation" or "done state," they are asking us to upgrade Events from a pure tagging mechanism into a lightweight planning + lifecycle primitive. We should be conservative about how much weight we add.

**How to apply:**
- Table is `events`: id, space_id, name, start_time, end_time, color, icon, description, created_at. `end_time > start_time` check constraint. No status, no budget. See migrations 0011, 022.
- `transactions.event_id` is `ON DELETE SET NULL` (migration 0013, line 25-27). Deleting an event leaves transactions intact but unlinked. No FK change needed when adding lifecycle.
- Procedures: `event.create | update | delete | listBySpace` (one-procedure-per-file). Mutations require owner/editor; list allows viewer.
- Analytics: `analytics.eventTotals` aggregates expense/income/tx-count per event. There is currently **no personal-space twin** for `eventTotals` — events are scoped to real spaces only. The personal namespace touches events only as an `eventId` filter on `personal.transactions` / `personal.transactionFilteredTotals`.
- `transaction.listBySpace` and `transaction.filteredTotals` BOTH already accept `eventId` as a filter — no server-side filter additions needed for an event detail page.
- File attachments: `file.listForEvent` already exists (joins `event_attachments`). Reuse on detail page.
- Transaction-entry UI: `EventSelect` in `apps/web/src/features/transactions/NewTransactionSheet.tsx` (lines ~882-917) and `EditTransactionSheet.tsx`. It fetches `event.listBySpace` and renders all events with no filter. The whole picker hides if the space has zero events.
- Events page (`apps/web/src/pages/space/events/EventsPage.tsx`) already classifies events as Past / Recent / Active / Upcoming purely from start/end dates — there's a UX precedent for date-derived state that any new lifecycle field should compose with, not contradict. Line 343 has an orphan "View" button.
- `TransactionsPage.tsx` keeps its row markup inline (~line 592 `.tx-row`); there's no shared `TransactionRow` component to reuse, so the event detail page either duplicates the row markup or extracts a shared component as part of Phase 1.
