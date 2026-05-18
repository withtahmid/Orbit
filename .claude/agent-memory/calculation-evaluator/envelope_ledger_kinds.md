---
name: envelope-ledger-kinds
description: How envelop_allocations.kind values map to "user funded this goal" vs "internal reallocation" for goal-progress aggregates
type: reference
---

`envelop_allocations.kind` enum (migration 045): `allocate`, `borrow`, `cover`, `reckon`, `restructure`.

For goal-progress aggregates (`lifetime_funded` etc.), the correct filter is:
```
WHERE a.amount > 0 AND a.kind IN ('allocate', 'borrow')
```

Rationale per kind:
- `allocate` (default) — user added money to envelope. Counts.
- `borrow` — user-driven borrow-link insert pulling future money into current period. Counts as funding (the borrowed money really did land in this goal envelope, even though a paired negative row exists in the other period).
- `cover` — envelope-to-envelope reallocation. The source envelope loses what the destination gains; counting the positive side would double-count net household funding. EXCLUDE.
- `reckon` — period-closing entry (overspend recognition). Not user-supplied funds. EXCLUDE.
- `restructure` — rename/cadence change record. Not money. EXCLUDE.

Writers for cover/reckon/restructure haven't landed yet; the filter is forward-defensive.

See `apps/server/src/procedures/analytics/CLAUDE.md` for the broader ledger-migration plan.
