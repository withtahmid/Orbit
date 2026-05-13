# Envelope ledger direction

This directory holds the on-read analytics for envelopes (`envelopeUtilization`,
`spaceSummary`, etc.). It is **mid-refactor** toward a typed envelope ledger.

## The target shape

`envelop_allocations` is being promoted to a first-class ledger. Migration
[`045_envelop_allocation_kind.mts`](../../db/kysely/migrations/045_envelop_allocation_kind.mts)
seeded two columns:

- `kind text NOT NULL DEFAULT 'allocate'`, check-constrained to
  `{'allocate', 'borrow', 'cover', 'reckon', 'restructure'}`
- `effective_at timestamptz` (nullable; readers should `COALESCE(effective_at, created_at)`)

Today every row reads `kind = 'allocate'` (or `'borrow'` after migration backfill).
The remaining kinds (`cover`, `reckon`, `restructure`) get their writers as the
ledger work lands.

## The rule for new analytics readers

**Derive from the ledger.** Do not add new columns or side tables to express
envelope state; express it as a filter or aggregate over `envelop_allocations`
typed by `kind`. Examples once the ledger is fully expressed:

- "Net overspent" → `SUM(amount) FILTER (WHERE kind = 'reckon' AND ...)` against
  the envelope's lifetime ledger (or zero if no reckon row exists).
- "Borrowed in / owed out" → paired `kind = 'borrow'` rows (already true today).
- "Carry-over recognised" → `kind = 'reckon'` row at period boundary.

## Stop-gaps to retire

Search the repo for `LEDGER-REPLACEABLE` comments. Each marker is a site that
expresses some envelope state via a special-purpose column or pill instead of
the ledger. The plan is to retire them as the ledger gains writers:

- `lifetime_overrun` SQL column on `envelopeUtilization.mts` (space + personal twin)
- The "net overspent (lifetime)" pills on EnvelopesPage card, EnvelopesPage list
  row, and analytics EnvelopesView row
- The `note` slot on the `HeroStat` component (`EnvelopeDetailPage.tsx`)

When the ledger expresses these natively, the markers — and the columns/UI
they tag — come out together.

## First reader to migrate

`envelopeUtilization.mts` is the smallest blast radius: single-envelope shape,
two render sites (EnvelopesPage card + EnvelopesView row), and its
`lifetime_overrun` column becomes a one-line `SUM(...) FILTER (WHERE kind=...)`
once the ledger writers land. Start there, prove the pattern, then `spaceSummary`.

## What's intentional, not a bug

`spaceSummary.mts` rolling-envelope held formula uses a one-sided `MAX` — see
the inline comment above the formula. Lifetime cushion absorbs a single-period
overspend on rolling envelopes by design. The reverse case (lifetime overspent,
period positive) is the bug the overlay was added to fix. If you ever want
period overspend to surface for rolling envelopes, the replacement formula is
documented inline.
