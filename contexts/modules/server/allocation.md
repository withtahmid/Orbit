# allocation module (server)

> A thin namespace housing cross-bucket allocation operations — currently a single `transfer` procedure that moves funds between any two (envelope|plan, optional-account) partitions in the same space. Also home to `resolveSpaceUnallocated`, the canonical space-level free-cash computation reused throughout the server.

## Router
- File: `apps/server/src/routers/allocation.mts`
- Composes procedures (`apps/server/src/routers/allocation.mts:4`):
  - `transfer` — debit one partition, credit another, atomically.

Note: envelope-allocation CRUD and plan-allocation CRUD live under the `envelop.*` and `plan.*` routers respectively (`envelop.allocationCreate`, `envelop.allocationDelete`, `plan.allocationCreate`, `plan.allocationDelete`). The `allocation.*` namespace is reserved for cross-cutting moves.

## Procedures
- **`transferAllocation`** (`procedures/allocation/transfer.mts:43`) — Auth: space `owner`/`editor` (gated after target resolution). Input:
  ```
  {
    amount: positive,
    from: { kind: "envelop", envelopId, accountId?: null } | { kind: "plan", planId, accountId?: null },
    to:   <same discriminated union>,
    idempotencyKey?: uuid
  }
  ```
  Behavior:
  1. Resolves source/destination via `resolveTargetInfo` (`transfer.mts:200`), which yields each side's `spaceId`, current `available` balance, and `periodStart` (only for envelope+monthly).
  2. Refuses if source and destination spaces differ (`transfer.mts:65`).
  3. Refuses if the exact same partition is on both sides — same `kind`, same envelope/plan id, same effective `accountId` (`transfer.mts:259`).
  4. Refuses if destination is an archived envelope; source archived is allowed (so trapped cash can be moved out) (`transfer.mts:84-96`).
  5. Verifies any pinned `accountId` is shared into the space via `space_accounts` (`transfer.mts:106-125`).
  6. Refuses if `fromInfo.available < amount` — source envelope uses period remaining (incl. carryIn), source plan uses signed `allocated` (`transfer.mts:128-135`).
  7. Inserts `-amount` row at source and `+amount` row at destination in the appropriate table (`envelop_allocations` or `plan_allocations`). Envelope rows carry the current-period `period_start` derived from `effectivePeriodStart(cadence, null, now)`.
  
  No transaction record is created — this is a planning-side rebalance, not a money movement between accounts. Wrapped in `withIdempotency`.

## Utilities (not exposed as procedures)
- **`resolveSpaceUnallocated`** (`procedures/allocation/utils/resolveSpaceUnallocated.mts:25`) — single CTE-heavy SQL pass returning the scalar `spendable − envelopeHeld − planHeld`:
  - **spendable**: `SUM(account_balances.balance)` over `space_accounts` of the space, with `liability` accounts negated and `locked` accounts excluded (`resolveSpaceUnallocated.mts:115-119`).
  - **envelopeHeld**: per envelope, `GREATEST(0, carryIn + allocated − consumed)` where `carryIn` honors `carry_policy`: `reset` → 0, `positive_only` → `max(0, prev_remaining)`, `both` → signed `prev_remaining` (`resolveSpaceUnallocated.mts:134-147`). Sum across envelopes. Outer `GREATEST(0,...)` ensures an overspent envelope holds zero, not negative — overspend shows as drift elsewhere but doesn't inflate free cash.
  - **planHeld**: signed `SUM(amount)` over all `plan_allocations` of the space (unclamped, so negative-net plan rows correctly raise free cash) (`resolveSpaceUnallocated.mts:155-159`).
  - Period math is inlined in SQL (DATE_TRUNC over UTC) so JS/Postgres timezone skew can't disagree with `resolveEnvelopePeriodBalance`.
  - Used by `procedures/plan/createAllocation.mts:68` to gate positive plan allocations, and by analytics/personal procedures for the dashboard "unallocated" widget.

## Database tables
This module owns no tables of its own — it reads `accounts`, `account_balances`, `space_accounts`, `envelops`, `envelop_allocations`, `plans`, `plan_allocations`, `expense_categories`, `transactions`. See the respective module files for ownership.

The only allocation-related migration directly affecting this module:
- **`025_allocation_account.mts`** — added `account_id` (nullable, FK RESTRICT) and `period_start` (envelope only) to both allocation tables; created the `idx_envelop_allocations_scope` and `idx_plan_allocations_scope` indexes that this module's queries (and `transfer.mts`'s insert paths) lean on.

## Domain math / invariants
- **Partition identity.** A "partition" for allocation purposes is the tuple:
  - envelope: `(envelopId, accountId, current period_start by cadence)`
  - plan: `(planId, accountId)` (no period)
  `accountId === null` means the unassigned pool; it's a real partition (queryable, transferable) distinct from any account-pinned one.
- **Source availability** (`transfer.mts:226-236` for envelope; `transfer.mts:247-252` for plan). Envelope source uses `resolveEnvelopePeriodBalance.remaining`, passing `accountId` through verbatim — `undefined` is preserved to roll up across accounts when no scope is given, rather than collapsing to `null` which would scope to unassigned-only. Plan source uses `resolvePlanBalance.allocated`.
- **Destination period for envelopes.** Always the current period of the envelope's cadence (`transfer.mts:218-220`). Callers cannot transfer into a historical or future period — that's a deliberate auditability constraint.
- **Symmetric idempotency.** `idempotencyKey` is registered once for the entire transfer (operation `"allocation.transfer"`); replays return the cached response without re-running either insert.

## Conventions & gotchas
- The `allocation` router/folder is intentionally minimal. CRUD for individual allocation rows lives under `envelop.*` and `plan.*` because the validation logic differs significantly (envelope deallocation checks `remaining`; plan allocation checks space free cash; etc.). Don't add envelope-or-plan-specific operations here.
- `resolveSpaceUnallocated` is the canonical free-cash function — do NOT reimplement it locally. New surfaces should call it through `ctx.services.qb`.
- `accountId` passed to `resolveEnvelopePeriodBalance` distinguishes three modes (`undefined` aggregate / `null` unassigned-pool / `string` specific). `transfer.mts` preserves this distinction; copy-paste code that coerces `null` to `undefined` (or vice versa) will subtly change the available number.
- A transfer never touches `account_balances` — the cash hasn't actually moved between bank accounts; only the planned assignment to envelopes/plans has changed.
- "Same partition" check (`sameTarget`, `transfer.mts:259`) treats `accountId: undefined` and `accountId: null` as equal — both normalize to `null`. Keep that in mind if you add new fields.

## Cross-references
- `contexts/modules/server/envelop.md` — provides `resolveEnvelopePeriodBalance`, `effectivePeriodStart`, and the `envelop_allocations` table.
- `contexts/modules/server/plan.md` — provides `resolvePlanBalance` and the `plan_allocations` table; `createPlanAllocation` is the other caller of `resolveSpaceUnallocated`.
- `contexts/modules/server/account.md` — `account_id` on allocation rows references `accounts` with `ON DELETE RESTRICT` (`migrations/025_allocation_account.mts:19`), and `space_accounts` membership is verified before any allocation move can pin an account.
- `apps/server/src/utils/withIdempotency.mts` — wraps `transferAllocation` and every other mutating procedure in this and sibling modules.
