---
name: migration-down-idempotence
description: Migrations that backfill new enum values from a legacy column (e.g. 045 → kind='borrow' from borrowed_link_id) are not round-trip safe once procedures write the new value without the legacy signal.
metadata:
  type: project
---

Migration 045 (`045_envelop_allocation_kind.mts`) backfills `kind='borrow'` only `WHERE borrowed_link_id IS NOT NULL`. Today every borrow row also sets `borrowed_link_id` (see `borrowFromNextMonth.mts`), so re-running up after down would correctly re-tag all borrow rows.

**However**, the moment a future procedure writes `kind='cover' | 'reckon' | 'restructure'` (the documented "soon" path in the migration comment) — or writes `kind='borrow'` without `borrowed_link_id` — those rows would be lost on a down→up cycle since the only backfill condition is the legacy column.

**How to apply:** when reviewing new procedures that begin writing new `kind` values, the migration's down() effectively becomes destructive. Either:
- Add an explicit warning in `down()` that data loss may occur;
- Drop only the column-and-keep-history strategy in favor of a follow-up backfill migration that uses the current column itself as the source of truth.

Today's migration is safe because no procedure writes `kind` yet — the column is purely additive seam.
