# envelop module (server)

> Per-space budget buckets with optional monthly cadence and three-mode carry policy; balances are computed on-read from `envelop_allocations` and matching `transactions`.

## Router
- File: `apps/server/src/routers/envelop.mts`
- Composes procedures (`apps/server/src/routers/envelop.mts:14`):
  - `create` / `update` / `delete` / `archive` — envelope CRUD + soft-retire.
  - `listBySpace` — flat list of envelopes in a space (includes archived).
  - `allocationCreate` / `allocationDelete` / `allocationListBySpace` — per-envelope allocation rows.
  - `borrowFromNextMonth` / `listBorrows` / `undoBorrow` — paired-row mechanism for pulling future-period funds forward.

## Procedures
- **`createEnvelop`** (`procedures/envelop/create.mts:11`) — Auth: space `owner`. Input: `{ spaceId, name, color?, icon?, description?, cadence: "none"|"monthly" = "none", carryOver?: bool, carryPolicy?: "reset"|"positive_only"|"both", idempotencyKey? }`. `carryPolicy` is canonical; legacy `carryOver` is mapped (true→`positive_only`, false→`reset`). Both columns are written so the two never disagree (`create.mts:47-66`). Wrapped in `withIdempotency`.
- **`updateEnvelop`** (`procedures/envelop/update.mts:11`) — Auth: space `owner`. Partial update including `cadence`, `carryOver`, `carryPolicy`. `carryPolicy` takes precedence; either being set also rewrites `carry_over` to match (`update.mts:64-76`).
- **`deleteEnvelop`** (`procedures/envelop/delete.mts:8`) — Auth: space `owner`. Cascades via FK to `envelop_allocations`; will fail (RESTRICT) if any `expense_categories.envelop_id` still references it (`migrations/0012_create_expense_categories_table.mts:13`).
- **`archiveEnvelop`** (`procedures/envelop/archive.mts:20`) — Auth: space `owner`. Sets `archived` boolean. Archived envelopes are hidden in default UI surfaces, reject new transactions via their categories (enforced by `resolveCategoryEnvelopActive` in `procedures/envelop/utils/resolveEnvelopActive.mts:43`), reject new categories under them, and reject new positive allocations (deallocation still allowed).
- **`listEnvelopsBySpace`** (`procedures/envelop/listBySpace.mts:8`) — Auth: any space role. Plain `SELECT * FROM envelops WHERE space_id = $1 ORDER BY created_at ASC`. Returns archived rows too — callers filter client-side.
- **`createEnvelopAllocation`** (`procedures/envelop/createAllocation.mts:34`) — Auth: space `owner`/`editor`. Input: `{ envelopId, amount (non-zero), accountId?: null, periodStart?, idempotencyKey? }`. Refuses positive amounts against archived envelopes but allows deallocation (`createAllocation.mts:77-82`). Validates `accountId` belongs to the space. Computes `periodStart` via `effectivePeriodStart(cadence, input, now)` so storage and queries align. **Positive (allocate):** no balance check, over-allocation is intentional soft state. **Negative (deallocate):** calls `resolveEnvelopePeriodBalance` and refuses if `remaining + amount < 0`.
- **`deleteEnvelopAllocation`** (`procedures/envelop/deleteAllocation.mts:8`) — Auth: space `owner`. Deletes one row from `envelop_allocations` by id.
- **`listEnvelopAllocationsBySpace`** (`procedures/envelop/listAllocationsBySpace.mts:8`) — Auth: any space role. Returns every allocation row joined through the envelope's `space_id`. Sorted `created_at DESC`.
- **`borrowFromNextMonth`** (`procedures/envelop/borrowFromNextMonth.mts:22`) — Auth: space `owner`/`editor`. Input: `{ envelopId, amount > 0, idempotencyKey? }`. Refuses unless `cadence='monthly'` and not archived. Inserts TWO `envelop_allocations` rows sharing a generated `borrowed_link_id`: `+amount` against the current UTC month, `-amount` against the next UTC month (`borrowFromNextMonth.mts:82-130`).
- **`listBorrows`** (`procedures/envelop/listBorrows.mts:24`) — Auth: any space role. Groups rows by `borrowed_link_id`, returning only links whose negative half is in the current month or later (or whose negative half is missing entirely — malformed links surface so the user can clean them up).
- **`undoBorrow`** (`procedures/envelop/undoBorrow.mts:22`) — Auth: space `owner`/`editor`. Input: `{ envelopId, linkId, idempotencyKey? }`. Deletes all rows matching both `envelop_id` and `borrowed_link_id`. Does not block on partial-consumption of the borrowed funds.

## Database tables
- **`envelops`** (`migrations/0010_create_envelops_table.mts`). `id`, `space_id` FK `ON DELETE CASCADE`, `name`, `created_at`, `updated_at`. Extended by:
  - `022_add_colors_and_icons.mts:11` — `color varchar(7)`, `icon varchar(48)`, `description text`.
  - `024_envelope_cadence.mts:6` — `cadence text NOT NULL DEFAULT 'none'` with CHECK `cadence IN ('none','monthly')`; `carry_over boolean NOT NULL DEFAULT false`.
  - `033_envelop_archived.mts:14` — `archived boolean NOT NULL DEFAULT false`, partial index `idx_envelops_active ON envelops(space_id) WHERE archived = false`.
  - `035_envelop_carry_policy.mts:23` — `carry_policy text NOT NULL DEFAULT 'reset'` with CHECK in (`reset`, `positive_only`, `both`); backfilled from `carry_over`. Both columns are kept in sync by procedures.
- **`envelop_allocations`** (`migrations/0014_create_envelop_allocations_table.mts`). `id`, `envelop_id` FK CASCADE, `amount numeric(12,2)` (signed), `created_at`, `created_by` FK `ON DELETE RESTRICT`. Extended by:
  - `025_allocation_account.mts:18` — `account_id uuid` nullable, FK `ON DELETE RESTRICT`; `period_start date` nullable. Index `idx_envelop_allocations_scope (envelop_id, account_id, period_start)`.
  - `032_envelop_borrow_link.mts:14` — `borrowed_link_id uuid` nullable, partial index `idx_envelop_allocations_borrow_link ON (borrowed_link_id) WHERE borrowed_link_id IS NOT NULL`.
- **Retired tables:** `envelop_balances` (formerly maintained by a transaction/allocation trigger) was dropped in `026_retire_envelop_balance.mts:44`; balances are now computed on-read.

## Domain math / invariants
- **Period window** (`procedures/envelop/utils/periodWindow.mts`). `cadence='none'` → `[EPOCH, FOREVER)`. `cadence='monthly'` → `[UTC month start, next UTC month start)`. All month math is UTC (`periodWindow.mts:39`). Previous-period window is the immediately preceding month.
- **Allocation period assignment** (`periodWindow.mts:51` — `effectivePeriodStart`). For `monthly`, prefer `periodStart` if provided else `date_trunc('month', created_at)`. SQL queries mirror this via `COALESCE(a.period_start, date_trunc('month', a.created_at)::date)` (`resolveEnvelopePeriodBalance.mts:153`, `resolveSpaceUnallocated.mts:68`).
- **`resolveEnvelopePeriodBalance`** (`procedures/envelop/utils/resolveEnvelopePeriodBalance.mts:41`). Returns `{ allocated, consumed, carriedIn, remaining }` for `(envelopId, accountId?, at)`. `consumed` sums expense transactions whose `expense_categories.envelop_id = envelopId` and `transaction_datetime ∈ [start, end)`. `carriedIn` = previous-period `(allocated − consumed)` adjusted by `carry_policy`: `reset` → 0, `positive_only` → `max(0, prev)`, `both` → signed `prev`. `accountId` scoping: `undefined` aggregates, `null` matches unassigned pool, string scopes to that account; expense matching uses `t.source_account_id` (`resolveEnvelopePeriodBalance.mts:181-186`).
- **Account scope on consumption.** Unassigned-pool deallocations (`accountId === null`) can never be matched against transactions because expenses always have a source account — the helper returns `FALSE` for the transaction match (`resolveEnvelopePeriodBalance.mts:183`).
- **Borrow rows.** Both halves of a borrow live in `envelop_allocations` with the same `borrowed_link_id` and aggregate naturally into the period balance (positive in this month, negative in next). `undoBorrow` deletes both atomically; `listBorrows` filters out links whose negative half is in a past period.
- **Space-level unallocated rollup** (`procedures/allocation/utils/resolveSpaceUnallocated.mts:25`) reimplements the same math in one CTE-heavy SQL pass so a single round-trip can deliver the dashboard number.

## Conventions & gotchas
- `carry_over` and `carry_policy` MUST stay synchronized — every writer in this module derives one from the other (`create.mts:65-66`, `update.mts:64-76`). Treat `carry_policy` as canonical when reading.
- Allocation `amount` is a signed `numeric(12,2)`; deallocation is a negative row, not an UPDATE.
- "Borrow" only makes sense for `cadence='monthly'`; rolling envelopes accumulate so there is no "next month" (`borrowFromNextMonth.mts:65-71`).
- Archived envelopes accept negative allocations so trapped cash can be freed without unarchiving (`createAllocation.mts:77-82`). Transfers OUT of an archived envelope are allowed but transfers IN are blocked (see `allocation.md`).
- `period_start` on `envelop_allocations` is `NULL` for `cadence='none'` and a date for `monthly`; SQL paths always `COALESCE` to `date_trunc('month', created_at)` so legacy rows without `period_start` still bucket correctly.
- Categories under an envelope share its envelope id by invariant — see `expenseCategory.md`. Changing a category's envelope re-points future routing but does NOT rewrite historical balance attribution (the on-read query joins live, so future balances reflect new routing immediately — there is no separate rebuild needed under the on-read model).
- `envelop` (no trailing `e`) is the canonical column/table spelling throughout the schema. Procedures and types follow it; resist the urge to "fix" it locally.

## Cross-references
- `apps/server/src/procedures/allocation/transfer.mts` — moves allocation between envelope/plan partitions; reads `resolveEnvelopePeriodBalance` for the source check.
- `apps/server/src/procedures/allocation/utils/resolveSpaceUnallocated.mts` — aggregates per-envelope holdings into the space-level free-cash number.
- `apps/server/src/procedures/envelop/utils/resolveEnvelopActive.mts` — the guard used by transaction/category code to refuse work on archived envelopes.
- `contexts/modules/server/expenseCategory.md` — categories carry the `envelop_id` link that lets transactions show up as `consumed` here.
