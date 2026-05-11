# reckoning module (server)

> YNAB-style reckoning of past-month envelope overspends. Surfaces unresolved overspends to the user; an acknowledgment is a record-only mutation (the actual money work happens via existing allocation / borrow procedures). Drives the per-space "strict" budget mode gate.

## Router

- File: `apps/server/src/routers/reckoning.mts:5`
- Procedures:
    - `listPending` — pending past-month overspends in a single space that the caller has not acknowledged.
    - `acknowledge` — mark one (envelope, period) as resolved by the caller.

The cross-space listing lives on `personal.reckoning.listPending` (`routers/personal.mts:84-86`); the acknowledge mutation has only one home (per-space) because each ack always targets a specific space.

## Procedures

- **`listPendingReckoning`** (`procedures/reckoning/listPending.mts:26`) — `authorizedProcedure`, query, transaction-wrapped. Input: `{ spaceId, lookbackDays: int 1..365, default 90 }`. Requires owner/editor/viewer membership (`listPending.mts:40-44`). Returns one row per `(envelop_id, period_start)` where ALL of:
    1. `period_start` is a completed past calendar month (`(m_start + INTERVAL '1 month') <= currentMonthStart`, `listPending.mts:118`).
    2. The envelope has `cadence = 'monthly' AND archived = false` (`listPending.mts:116-117`).
    3. `consumed > allocated` for that period.
    4. No existing row in `reckoning_acknowledgments` for `(space_id, envelop_id, user_id=caller, period_start)` (`listPending.mts:124-130`).

    Result shape (per row): `{ envelopId, name, color, icon, periodStart, allocated, consumed, overBy }` where `overBy = consumed - allocated`. Sorted `period_start ASC, name ASC`.

- **`acknowledgeReckoning`** (`procedures/reckoning/acknowledge.mts:24`) — `authorizedProcedure`, mutation, transaction-wrapped, idempotent via `withIdempotency` (`acknowledge.mts:36`). Input: `{ envelopId, periodStart, resolution: "pulled" | "borrowed" | "absorbed", idempotencyKey? }`. Behavior:
    1. Loads the envelope row, throws `NOT_FOUND` if missing (`acknowledge.mts:47-52`).
    2. Verifies caller is a member (any role) of the envelope's space.
    3. Clamps `input.periodStart` to a calendar-month start via `DATE_TRUNC('month', ...)` (`acknowledge.mts:71-81`). Prevents acknowledging an arbitrary date that `listPending` would never surface — leaves the strict-gate lookup intact.
    4. Verifies the period is a settled past month for a monthly envelope AND is genuinely overspent (`acknowledge.mts:150-166`). The overspent check uses `GREATEST(over_space, over_user)` where:
        - `over_space` = consumed-by-anyone minus allocated.
        - `over_user` = consumed-by-caller (`source_account_id = ANY(owned)`) minus allocated.
       Either positive value qualifies; this lets a user click "Acknowledge" from either the space or the personal reckoning surface (`acknowledge.mts:88-94`).
    5. Inserts into `reckoning_acknowledgments` with `ON CONFLICT (...) DO NOTHING` (`acknowledge.mts:176-186`) so retries are harmless.

    The procedure does **not** move money. It records that "I have decided how to resolve this." The actual resolution happens via the existing `allocation.transfer` (pull from another envelope), `envelop.borrowFromNextMonth` (borrow), or no-op (absorb) paths.

## Database tables

### `reckoning_acknowledgments` (migration `036_reckoning_acknowledgments.mts:25`)

Columns:
- `space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE cascade`
- `envelop_id uuid NOT NULL REFERENCES envelops(id) ON DELETE cascade`
- `user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade`
- `period_start date NOT NULL`
- `resolution text NOT NULL`, CHECK `resolution IN ('pulled', 'borrowed', 'absorbed')` (`036:52`)
- `acknowledged_at timestamptz NOT NULL DEFAULT NOW()`

Composite PK: `(space_id, envelop_id, user_id, period_start)` (`036:42`) — enforces "one ack per envelope per user per period." Re-acknowledging is a harmless upsert no-op.

Secondary index `idx_reckoning_acks_space_user` on `(space_id, user_id, period_start)` (`036:57`) — accelerates the strict-gate / list-pending `NOT EXISTS` lookups.

Generated type: `ReckoningAcknowledgments` at `db/kysely/types.mts:179`.

### `spaces.budget_mode` (migration `037_space_budget_mode.mts:14`)

- `budget_mode text NOT NULL DEFAULT 'flexible'` (`037:17`)
- CHECK `spaces_budget_mode_check`: `budget_mode IN ('flexible', 'strict')` (`037:22`)

Migration docstring (`037:4-12`): `'flexible'` allows overspend with no gating; `'strict'` blocks new transaction creation in the space while any past-month overspends remain unresolved by the current user. Default is flexible so introduction is non-disruptive.

Generated type: `Spaces.budget_mode` at `db/kysely/types.mts:202`.

## Domain math / invariants

### Consumption formula

Both `listPending` and `resolveStrictGate` define a period's consumed amount as the `UNION ALL` of:

```sql
SELECT t.amount  FROM transactions t JOIN expense_categories ec ON ec.id = t.expense_category_id
WHERE ec.envelop_id = e.id AND t.type = 'expense'   ...
UNION ALL
SELECT t.fee_amount FROM transactions t JOIN expense_categories ec ON ec.id = t.fee_expense_category_id
WHERE ec.envelop_id = e.id AND t.type = 'transfer' AND t.fee_amount IS NOT NULL ...
```

(`listPending.mts:93-111`, `resolveStrictGate.mts:64-81`). Without the fee union, a fee-only overspend would silently bypass the gate. This matches the canonical `analytics.envelopeUtilization` formula (see analytics module).

### Allocation formula

Allocated in a period uses `COALESCE(a.period_start, DATE_TRUNC('month', a.created_at)::date)` as the effective period anchor (`listPending.mts:79-86`). Old allocations created before the `period_start` column was introduced get the legacy month-of-creation fallback.

### Strict-mode gate

The gate lives in **`procedures/space/utils/resolveStrictGate.mts:19`**, not the reckoning procedures dir, because the transaction module imports it (`procedures/transaction/expense.mts:40`, `transfer.mts:57`, `adjust.mts:36`). Behavior (`resolveStrictGate.mts:19-109`):

1. Reads `spaces.budget_mode`. If not `'strict'`, returns immediately (`resolveStrictGate.mts:34`).
2. Otherwise, counts envelopes in the same `[lookbackDays = 90, currentMonthStart)` window with `consumed > allocated` AND no matching `reckoning_acknowledgments` row for the caller (`resolveStrictGate.mts:45-100`).
3. If count > 0, throws `PRECONDITION_FAILED` with a message pointing to the reckoning page.

Key properties:
- **Per-user gating**: each user reckons with their own view of the past; co-owners don't block one another (`resolveStrictGate.mts:16-17`).
- **90-day lookback**: matches `listPending`'s default. Older drift doesn't block — prevents strict mode from holding users hostage to ancient unreconciled months.
- Income transactions don't call `resolveStrictGate`; only expense/transfer/adjust do (compare transaction module's procedure list).

### Resolution kinds

The `resolution` column is informational. The mapping to actual workflows (per migration `036:18-22`):

- `'pulled'` — user pulled cover from another envelope (via `allocation.transfer`).
- `'borrowed'` — user converted to a next-month borrow (via `envelop.borrowFromNextMonth`).
- `'absorbed'` — user accepted the silent absorption (no money moved).

No procedure here verifies that the corresponding work was actually done — the ack is a user decision, recorded for the audit trail.

## Conventions & gotchas

- The strict gate uses `lookbackDays = 90` hard-coded (`resolveStrictGate.mts:43`). `listPendingReckoning` accepts a `lookbackDays` input but defaults to 90 too. If they ever drift, the UI will show pending items the gate doesn't enforce (or vice versa) — keep them aligned.
- `acknowledge` re-validates overspend on the server (`acknowledge.mts:103-148`). Don't trust the client's claim that "this is overspent" — a malicious client could otherwise preemptively ack future months to bypass the gate (comment at `acknowledge.mts:85-88`).
- Acknowledgments are per-user but the resolution work (e.g. pulling cover) is per-space. So one user can ack-and-absorb while a co-owner remains blocked. This is intentional — see `resolveStrictGate.mts:16-17`.
- `clamped` (`acknowledge.mts:71`) is computed in Postgres rather than JS so it always matches `DATE_TRUNC('month', ...)::date`, the exact format `listPending` and the PK use. Don't replace it with `new Date(... .toISOString())` — that risks off-by-one against timezone-dependent month boundaries.
- The empty-array sentinel `00000000-0000-0000-0000-000000000000` (`acknowledge.mts:99-101`) appears because `source_account_id = ANY(empty[])` is always false; we use a never-matching UUID so the SQL stays compilable when the user has no owned accounts.
- The `period_start` column is `date` (not `timestamptz`); the PK comparison is `r.period_start = m.m_start::date`. When debugging from a transcript, be careful that bound parameters are cast to `date` not `timestamp`.

## Cross-references

- `transaction.expense` / `transfer` / `adjust` — call `resolveStrictGate` before inserting (see transaction module). Income is intentionally exempt.
- `personal.reckoning.listPending` (`procedures/personal/reckoningListPending.mts:14`) — cross-space variant. Restricts consumption to `source_account_id = ANY(owned)` for the personal-slice overspend view.
- `analytics.envelopeUtilization` — same `UNION ALL` expense+fee consumption formula. If you change that, change `listPending`, `acknowledge`, and `resolveStrictGate` together.
- `envelop.borrowFromNextMonth` / `allocation.transfer` — the actual money paths a `resolution` value refers to. Reckoning records the decision; those procedures execute it.
