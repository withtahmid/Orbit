# Envelope analytics — the simplified model

This directory holds the on-read analytics for envelopes (`envelopeUtilization`,
`spaceSummary`, etc.). As of migration `048_simplify_budgeting`, the budgeting
model is deliberately simple — the earlier "promote `envelop_allocations` to a
typed ledger" direction was **abandoned**.

## The allocation shape

`envelop_allocations` holds **exactly one row per (envelope, period)**, enforced
by the unique index `(envelop_id, period_start) NULLS NOT DISTINCT`:

- **Monthly** envelopes (`cadence='monthly'`): one row per calendar month.
  `period_start` is the **APP_TZ (Asia/Dhaka) month-start** date. `amount` is the
  ABSOLUTE allocated total for that month — not a delta.
- **Rolling / goal** envelopes (`cadence='none'`): exactly one lifetime row with
  `period_start IS NULL`. `amount` is the absolute lifetime pool.

There is no per-change history, no `kind`/`effective_at`/`borrowed_link_id`, and
no `account_id` — allocations are space-wide. Allocating/deallocating UPSERTs the
single row (`amount = amount + delta`); transfer is two such upserts.

## Reading allocations

- **Monthly** "allocated for month M" → the single row `WHERE period_start = M`.
  Multi-month windows sum the per-month rows.
- **Rolling/goal** → the single row `WHERE period_start IS NULL`. Always match on
  `IS NULL`, never a date range (a date comparison drops the NULL row).
- The PG session runs in `Asia/Dhaka` (see `db/index.mts`), so SQL
  `date_trunc('month', NOW())::date` and `::date` casts align with the JS
  `periodWindow.mts` boundaries.

## Semantics (no carry, no borrow, no reckoning)

- **Monthly resets every period.** `remaining = allocated(month) − consumed(month)`.
  Last month's surplus does NOT roll forward.
- **Rolling/goal keep going.** `allocated` = lifetime pool, `consumed` = all-time
  spend, `remaining = allocated − consumed`.
- **Held** (the cash an envelope ties up, feeding space `unallocated`) is
  `GREATEST(0, allocated − consumed)` per envelope, summed. Overspend shows as
  drift but never inflates free cash. `spaceSummary` and `resolveSpaceUnallocated`
  must produce the same held number — they feed the same `unallocated`.
- **Overspend is shown, never blocked or nagged.** There is no strict mode and no
  reckoning. `lifetimeOverrun` on rolling envelopes (`GREATEST(0, lifetime
  consumed − lifetime allocated)`) is a permanent derived display field.

## Rule for new readers

Express envelope state as a filter/aggregate over the one-row-per-period
`envelop_allocations`. Do not reintroduce a delta ledger, per-account allocation,
carry policies, borrowing, or side tables — those were removed on purpose.
