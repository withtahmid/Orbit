# expenseCategory module (server)

> Per-space hierarchical spending categories, each pinned to exactly one envelope; categories route expense transactions onto envelope balance computations and carry an inheritable priority tier.

## Router
- File: `apps/server/src/routers/expenseCategory.mts`
- Composes procedures (`apps/server/src/routers/expenseCategory.mts:10`):
  - `create` / `update` / `delete` — category CRUD.
  - `changeParent` — re-parent within the same space.
  - `changeEnvelop` — re-point self + subtree to a different envelope.
  - `listBySpace` — flat list, no stats.
  - `listBySpaceWithUsage` — same list plus `tx_count`, `spent_total`, `last_used` over an optional period window.

## Procedures
- **`createExpenseCategory`** (`procedures/expenseCategory/create.mts:11`) — Auth: space `owner`. Input: `{ spaceId, name, parentId?: null, envelopId, color?, icon?, priority?: "essential"|"important"|"discretionary"|"luxury", idempotencyKey? }`. Validates: parent (if given) belongs to the same space AND has the same `envelop_id` as the new row (`create.mts:42-63` — children share parent's envelope by invariant). Verifies target envelope belongs to the space and is not archived. Wrapped in `withIdempotency`.
- **`updateExpenseCategory`** (`procedures/expenseCategory/update.mts:10`) — Auth: space `owner`. Partial update of `name`, `color`, `icon`, `priority` (priority accepts `null` to clear). Cannot change `parent_id` or `envelop_id` here — use the dedicated procedures.
- **`deleteExpenseCategory`** (`procedures/expenseCategory/delete.mts:8`) — Auth: space `owner`. Deletes one category row. FK `parent_id` is `ON DELETE RESTRICT` (`migrations/0012_create_expense_categories_table.mts:11`), so deleting a category with children fails; the FK from `transactions.expense_category_id` has no constraint declared in the migration but the procedure does no pre-check — deleting a category referenced by transactions may fail at the DB layer or silently orphan depending on schema state.
- **`changeExpenseCategoryParent`** (`procedures/expenseCategory/changeParent.mts:8`) — Auth: space `owner`. Input: `{ categoryId, parentId: uuid|null }`. Refuses self-parenting (`changeParent.mts:50`). Validates target parent is in the same space. **Does not validate that parent shares the same envelope** — see gotchas.
- **`changeExpenseCategoryEnvelop`** (`procedures/expenseCategory/changeEnvelop.mts:21`) — Auth: space `owner`. Re-points the category AND its entire descendant subtree to a different envelope in a single recursive CTE update (`changeEnvelop.mts:76-88`). Refuses if target envelope is in a different space or is archived. Returns `{ movedCount }`.
- **`listExpenseCategoriesBySpace`** (`procedures/expenseCategory/listBySpace.mts:8`) — Auth: any space role. Flat `SELECT` ordered by `created_at ASC`. Returns all rows; client builds the tree from `parent_id`.
- **`listExpenseCategoriesBySpaceWithUsage`** (`procedures/expenseCategory/listBySpaceWithUsage.mts:19`) — Auth: any space role. Input: `{ spaceId, periodStart?, periodEnd? }`. One SQL pass joining categories LEFT JOIN a `usage` CTE that sums expense rows AND transfer fees attributed to the category via `fee_expense_category_id` (`listBySpaceWithUsage.mts:55-87`). Returns `{ ..., tx_count, spent_total, last_used }`.

## Database tables
- **`expense_categories`** (`migrations/0012_create_expense_categories_table.mts`). Columns: `id uuid PK uuidv7`, `space_id uuid` FK CASCADE, `parent_id uuid` FK `ON DELETE RESTRICT` (self-reference), `envelop_id uuid NOT NULL` FK `ON DELETE RESTRICT`, `name varchar(255)`, `created_at`, `updated_at`. Extended by:
  - `022_add_colors_and_icons.mts:30` — `color varchar(7)` default `#10b981`, `icon varchar(48)` default `folder`.
  - `031_add_category_priority.mts:18` — `priority text` nullable, CHECK constraint enforces `priority IN ('essential','important','discretionary','luxury')`.
  - Indexes from `020_create_indexes.mts:41-54`: `idx_expense_categories_space`, `idx_expense_categories_envelop`, `idx_expense_categories_parent`.

## Domain math / invariants
- **Envelope link drives balance attribution.** The on-read envelope balance query in `procedures/envelop/utils/resolveEnvelopePeriodBalance.mts:73-79` joins `transactions JOIN expense_categories ON ec.id = t.expense_category_id WHERE ec.envelop_id = $1 AND t.type='expense'`. Re-pointing a category via `changeEnvelop` therefore reattributes its historical transactions live — there is no materialized snapshot to rebuild under the on-read model (legacy comment on `changeEnvelop.mts:16-19` predates the retirement of `envelop_balances` in `026_retire_envelop_balance.mts`).
- **Subtree envelope coherence.** `create` enforces "child shares parent's envelope_id" (`create.mts:56-62`). `changeExpenseCategoryEnvelop` updates the whole subtree atomically (`changeEnvelop.mts:76-88`) to maintain that invariant.
- **Priority inheritance.** `priority` is nullable on the row; the documented model (`migrations/031_add_category_priority.mts:6-15`) is that children with NULL priority inherit from the nearest non-null ancestor. The DB does not enforce this — consumers (analytics) walk the tree.

## Conventions & gotchas
- `changeExpenseCategoryParent` does NOT verify that the new parent shares the moving category's envelope. Reparenting to a parent under a different envelope leaves the subtree inconsistent with the "children share parent's envelope" invariant — callers should pair it with `changeExpenseCategoryEnvelop` for cross-envelope moves. The `create` validation is the only place this is enforced.
- The category → envelope FK is `ON DELETE RESTRICT`, which is why `deleteEnvelop` will fail if any category still routes to it. Move or delete the categories first.
- Transfer transactions can also feed a category through `transactions.fee_expense_category_id` (`migrations/030_add_transfer_fees.mts`). The usage view (`listBySpaceWithUsage.mts:67-79`) unions these in with regular expenses so the "spent in this category" number agrees with `analytics.categoryBreakdown`.
- `priority` CHECK is defined inline on the column (`migrations/031_add_category_priority.mts:22`), not as a named enum type — values are raw strings. The TS type is `string | null` in `db/kysely/types.mts:121`; procedures cast it to the literal union manually.
- `parent_id` is RESTRICT, so deleting a non-leaf category fails. The UI should walk leaves-first or use `changeParent` to flatten first.

## Cross-references
- `contexts/modules/server/envelop.md` — owns the `envelop_id` link; archive guards block creation under archived envelopes and `changeEnvelop` to archived targets.
- `apps/server/src/procedures/envelop/utils/resolveEnvelopActive.mts` — used by transaction code to refuse work on categories whose envelope is archived.
- `apps/server/src/procedures/envelop/utils/resolveEnvelopIdFromExpenseCategory.mts` — small lookup helper used elsewhere when only the category id is known.
- `apps/server/src/procedures/analytics/*` — primary consumer of the category tree + priority for breakdown reports.
