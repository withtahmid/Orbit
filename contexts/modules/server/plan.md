# plan module (server)

> Long-term savings goals scoped to a space, with optional target amount/date; balance is the signed sum of `plan_allocations` (no cadence, no consumption).

## Router
- File: `apps/server/src/routers/plan.mts`
- Composes procedures (`apps/server/src/routers/plan.mts:10`):
  - `create` / `update` / `delete` — plan CRUD.
  - `listBySpace` — all plans in a space.
  - `allocationCreate` / `allocationDelete` / `allocationListBySpace` — per-plan allocation rows.

## Procedures
- **`createPlan`** (`procedures/plan/create.mts:11`) — Auth: space `owner`. Input: `{ spaceId, name, color?, icon?, description?, targetAmount?: positive, targetDate?, idempotencyKey? }`. Wrapped in `withIdempotency`. Inserts a row into `plans`. Target fields default to `null` when omitted.
- **`updatePlan`** (`procedures/plan/update.mts:10`) — Auth: space `owner`. Partial update; at least one field required. `targetAmount` and `targetDate` accept `null` to clear. Bumps `updated_at`.
- **`deletePlan`** (`procedures/plan/delete.mts:8`) — Auth: space `owner`. Inside a transaction; cascades via FK to `plan_allocations`.
- **`listPlansBySpace`** (`procedures/plan/listBySpace.mts:8`) — Auth: any space role. `SELECT id, space_id, name, color, icon, description, target_amount, target_date, created_at, updated_at FROM plans WHERE space_id = $1 ORDER BY created_at ASC`.
- **`createPlanAllocation`** (`procedures/plan/createAllocation.mts:11`) — Auth: space `owner`/`editor`. Input: `{ planId, amount (non-zero), accountId?: null, idempotencyKey? }`. Validates `accountId` belongs to the space if pinned. **Positive (allocate):** consults `resolveSpaceUnallocated(spaceId)` and refuses if `free < amount` (`createAllocation.mts:67-77`) — unlike envelopes, plans CANNOT over-allocate. **Negative (deallocate):** consults `resolvePlanBalance({planId, accountId})` and refuses if `allocated + amount < 0`. Idempotent via `withIdempotency`.
- **`deletePlanAllocation`** (`procedures/plan/deleteAllocation.mts:8`) — Auth: space `owner`. Deletes one `plan_allocations` row by id.
- **`listPlanAllocationsBySpace`** (`procedures/plan/listAllocationsBySpace.mts:8`) — Auth: any space role. Joins `plan_allocations` through `plans.space_id`, sorts `created_at DESC`.

## Database tables
- **`plans`** (`migrations/0016_create_plans_table.mts`). `id uuid PK uuidv7`, `space_id uuid` FK `ON DELETE CASCADE`, `name varchar(255)`, `created_at`, `updated_at`. Extended by:
  - `022_add_colors_and_icons.mts:19` — `color varchar(7)` default `#10b981`, `icon varchar(48)` default `target`.
  - `023_add_plan_target_fields.mts:5` — `description text`, `target_amount numeric(20,2)`, `target_date date`, all nullable.
  - Index `idx_plans_space` from `020_create_indexes.mts:38`.
- **`plan_allocations`** (`migrations/0017_create_plans_allocation_table.mts`). `id`, `plan_id` FK `ON DELETE CASCADE`, `amount numeric(12,2)` (signed), `created_at`, `created_by` FK `ON DELETE RESTRICT`. Extended by:
  - `025_allocation_account.mts:25` — `account_id uuid` nullable, FK `ON DELETE RESTRICT`. Index `idx_plan_allocations_scope (plan_id, account_id)`.
  - Indexes `idx_plan_allocations_plan`, `idx_plan_allocations_created_at` from `020_create_indexes.mts:67`.
- **Retired table:** `plan_balances` (materialized totals + trigger from `021_create_plan_balance_and_trigger.mts`) was dropped in `026_retire_envelop_balance.mts:45` along with the envelope balance table. All balances are now computed on-read.

## Domain math / invariants
- **No cadence, no consumption.** A plan's balance is `SUM(amount)` over its allocation rows filtered by the optional account scope. There is no notion of "period" and no `expense_categories.plan_id` — transactions never directly reduce a plan's balance.
- **`resolvePlanBalance`** (`procedures/plan/utils/resolvePlanBalance.mts:22`) — single helper returning `{ planId, accountId, allocated }`. `accountId` scoping mirrors envelope semantics: `undefined` aggregates across accounts (plan total), `null` matches `account_id IS NULL` (unassigned pool), string scopes to one account.
- **Funding cap.** Allocating to a plan is gated by `resolveSpaceUnallocated(spaceId)` (`createAllocation.mts:68`). The space's free cash = sum of asset/liability `account_balances` − envelope holdings − existing plan allocations; a plan can never be funded beyond what the space has actually received as income. (Compare with envelopes, which permit soft over-allocation.)
- **Reductions.** A plan only shrinks through (a) an explicit negative `plan_allocations` row via `createPlanAllocation` or `deletePlanAllocation`, or (b) a transfer (`procedures/allocation/transfer.mts`) that injects a `-amount` row.

## Conventions & gotchas
- Plans have target fields purely for UI/analytics; no procedure enforces or reads them. `target_amount` is `positive()` in zod but persisted as nullable.
- `account_id` on `plan_allocations` is RESTRICT-deleted: an `accounts` row referenced here cannot be deleted (or unshared from a space that owns the linked plan) without first deleting/transferring the allocation.
- Unlike envelopes, plans have no archive flag. Delete is the only "retire" option.
- Plan allocations contribute to `resolveSpaceUnallocated`'s `plan_held` as the **unclamped signed sum** of all `plan_allocations` for the space (`resolveSpaceUnallocated.mts:155-159`). Negative plan rows therefore increase free cash, which is the intended way to "convert plan → unallocated" via a deallocation entry.
- A plan that crosses spaces is not supported — `plans.space_id` is non-null and there's no analog of `space_accounts`.

## Cross-references
- `apps/server/src/procedures/allocation/transfer.mts` — moves allocation between plans/envelopes; resolves plan source via `resolvePlanBalance`.
- `apps/server/src/procedures/allocation/utils/resolveSpaceUnallocated.mts` — gates `createPlanAllocation` and sums plan allocations into space-level holdings.
- `contexts/modules/server/envelop.md` — counterpart bucket with cadence and on-read consumption; the two share the `allocation.transfer` endpoint.
- `contexts/modules/server/account.md` — accounts pinned via `plan_allocations.account_id`; unshare/delete refuses while a plan still references the account.
