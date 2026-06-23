# transaction module (server)

> Records every money movement (income / expense / transfer / adjustment). The DB enforces per-type column shapes via CHECK constraints, and a PL/pgSQL trigger keeps `account_balances` in sync on every INSERT / UPDATE / DELETE.

## Router

- File: `apps/server/src/routers/transaction.mts:11`
- Procedures:
    - `income` — credit one account, no source.
    - `expense` — debit one account against an expense category.
    - `transfer` — move money between two accounts, optional fee categorized as expense.
    - `adjust` — reconcile an account to an absolute target balance; synthesizes an `adjustment` row.
    - `update` — partial edit of any existing row; gated by created-by OR owner/editor.
    - `delete` — hard delete; trigger reverses the balance effect.
    - `listBySpace` — paginated listing with rich filter set.
    - `filteredTotals` — IN/OUT/NET/COUNT/AVG-PER-DAY for the same filter set as `listBySpace`.

## Procedures

### Mutations

- **`createIncomeTransaction`** (`procedures/transaction/income.mts:12`) — `authorizedProcedure`, single transaction wrapped in `withIdempotency` (`income.mts:29`) keyed on `(userId, "transaction.income", idempotencyKey)`. Input: `{ spaceId, amount>0, datetime?, description?, location?, accountId, eventId?, attachmentFileIds[≤10]?, idempotencyKey? }`. Permission via `resolveTransactionPermission` (`income.mts:35`): the destination must either be owned by the caller OR shared into a space the caller is a member of (`utils/resolveTransactionPermission.mts:62-89`). `resolveTransactionSpaceIntegrity` (`income.mts:43`) requires `space_id` to share at least one account with the row. Optional `eventId` is validated via `resolveEventBelongsToSpace` with `requireActive: true` (`income.mts:55`) — a closed event id, e.g. from a stale event pin, is rejected at this layer.

- **`createExpenseTransaction`** (`procedures/transaction/expense.mts:16`) — `authorizedProcedure`, transaction-wrapped, idempotent (`expense.mts:34`). Input adds `sourceAccountId`, `expense_category_id` (UUID, required), `eventId?`. Calls in order: `resolveTransactionPermission` (`expense.mts:39`) requires the caller to be `'owner'` of the source account (`utils/resolveTransactionPermission.mts:100`) and the source account must not be `account_type = 'locked'` (`utils/resolveTransactionPermission.mts:175`); `resolveExpenseCategoryBelongsToSpace`; `resolveCategoryEnvelopActive` (rejects spending against an archived envelope). There is no balance pre-check — expenses can drive the source account negative; the web sheets surface an inline overspend hint mirroring the envelope-overspend warning.

- **`createTransferTransaction`** (`procedures/transaction/transfer.mts:15`) — `authorizedProcedure`, transaction-wrapped, idempotent. Input adds `sourceAccountId`, `destinationAccountId`, optional pair `{ feeAmount > 0, feeExpenseCategoryId }`. Pre-flight rejects mismatched fee fields with `BAD_REQUEST` (`transfer.mts:39`) — both move together (the DB CHECK at migration `030:34` enforces the same). `resolveTransactionPermission` (`utils/resolveTransactionPermission.mts:111`) requires: caller `'owner'` of source; source not `locked`; destination either `'owner'` by caller OR `'viewer'` by caller in a space that also shares the source. No balance pre-check — transfers can drive the source account negative, same as expenses.

- **`adjustAccountBalance`** (`procedures/transaction/adjust.mts:13`) — `authorizedProcedure`, transaction-wrapped, idempotent. Input: `{ spaceId, accountId, newBalance, datetime?, description?, location?, attachmentFileIds?, idempotencyKey? }`. Computes `delta = newBalance - current` in Postgres (`adjust.mts:64`) to preserve `numeric(20,2)` precision (no JS float round-trip). Throws `BAD_REQUEST` if `delta == 0` (`adjust.mts:91`). Direction of the adjustment row depends on sign: when `newBalance < current` the synthesized row has `source_account_id = accountId` (decrease); when `newBalance > current` it has `destination_account_id = accountId` (increase). The CHECK `transactions_adjustment_check` (migration `0013:42`) enforces exactly one of source/destination is set.

- **`updateTransaction`** (`procedures/transaction/update.mts:15`) — `authorizedProcedure`, transaction-wrapped. NOT idempotent. Input: all fields optional except `transactionId`. Permission: the creator can always edit; otherwise the caller must be `owner`/`editor` of the space (`update.mts:51`). Computes a `merged` value from `existing` + `input` (`update.mts:59`) so partial updates work. Fee fields are validated (both null or both set, `update.mts:97`); fees rejected on non-transfers (`update.mts:107`). Type cannot change (no input field for it). No balance pre-check on edit either — edits are recording reality, same as creates, and may drive the source account negative. The update is a plain UPDATE — the balance trigger fires `OLD direction=-1` then `NEW direction=+1` so balances stay correct (migration `018:90`).

- **`deleteTransaction`** (`procedures/transaction/delete.mts:8`) — `authorizedProcedure`, transaction-wrapped. Input `{ transactionId }`. Same creator-OR-owner/editor permission as update (`delete.mts:26`). Hard delete; the trigger reverses the balance effect via `direction=-1` (`migrations/018:96`). Returns `{ message: "Transaction deleted" }`.

### Queries

- **`listTransactionsBySpace`** (`procedures/transaction/list.mts:9`) — `authorizedProcedure`. Cursor-pagination by `transactions.id DESC` (uuidv7 → time-ordered). Joins `expense_categories` and `users` (for the creator card). Input filters (all nullish unless noted):
    - `spaceId` (required), `userId`, `type` (income/expense/transfer/adjustment), `envelopId` (joined via `expense_categories.envelop_id`), `expenseCategoryId` (+ `includeDescendants: boolean = true` resolves the category subtree with a `WITH RECURSIVE subtree` CTE at `list.mts:44-58`; falls back to `[expenseCategoryId]` if the CTE returns nothing), `eventId`, `accountId` (matches either `source_account_id` OR `destination_account_id`), `search` (ILIKE on `description` OR `location`), `amountMin`/`amountMax`, `dateFrom`/`dateTo` (half-open `[from, to)`), `cursor` (id-based), `limit` (1-200, default 50). Fetches `limit + 1`, slices to compute `hasMore`, returns `{ items, nextCursor }` (`list.mts:142`).

- **`transactionFilteredTotals`** (`procedures/transaction/filteredTotals.mts:22`) — `authorizedProcedure`. Same filter shape as `listBySpace` (no cursor/limit). Returns `{ inTotal, outTotal, net, count, avgPerDay, days }`. `inTotal` sums `type='income'` rows; `outTotal` sums `type='expense'` rows PLUS `fee_amount` on `type='transfer'` rows where `fee_amount IS NOT NULL` (`filteredTotals.mts:177-189`). This mirrors `analytics.cashFlow`'s definition of outflow — a transfer fee is real money lost. `avgPerDay = outTotal / days`; `days = max(1, round((dateTo - dateFrom) / 1 day))` or `1` when no window provided (`filteredTotals.mts:201-206`).

## Database tables

### `transactions` (migration `0013_create_transactions_table.mts`, altered by `030`)

Columns (`0013:11-27`):
- `id uuid PK default uuidv7()`
- `space_id uuid NOT NULL REFERENCES spaces(id)`
- `created_by uuid NOT NULL REFERENCES users(id)` (`027` later switched FK to `ON DELETE restrict`)
- `type __type_transaction_type NOT NULL` — Postgres enum: `income | expense | transfer | adjustment` (`0013:6`)
- `amount numeric(12, 2) NOT NULL`, CHECK `amount > 0` (`0013:28`)
- `source_account_id uuid REFERENCES accounts(id)`
- `destination_account_id uuid REFERENCES accounts(id)`
- `description text NULL`, `location varchar(255) NULL`
- `transaction_datetime timestamptz NOT NULL DEFAULT NOW()` (settable; used for analytics windowing)
- `created_at timestamptz NOT NULL DEFAULT NOW()`
- `expense_category_id uuid REFERENCES expense_categories(id)`
- `event_id uuid REFERENCES events(id) ON DELETE set null` (`0013:25`)

Migration `030_add_transfer_fees.mts` adds:
- `fee_amount numeric(12, 2) NULL` (`030:24`)
- `fee_expense_category_id uuid REFERENCES expense_categories(id) ON DELETE restrict` (`030:25`)

Per-type CHECK constraints (`0013:28-44`):
- `transactions_income_check`: income → destination set, source null.
- `transactions_expense_category_check`: expense → source + category set, destination null.
- `transactions_transfer_check`: transfer → both accounts set and distinct.
- `transactions_adjustment_check`: adjustment → exactly one of source/destination set (XOR via `<>`).
- `transactions_fee_shape_check` (`030:35`): fees null together OR `fee_amount > 0 AND fee_expense_category_id IS NOT NULL AND type = 'transfer'`.

### Balance-sync trigger

Defined in migration `018_create_update_account_balance_trigger.mts`, function body replaced by `030_add_transfer_fees.mts:54` to fold fees in.

- `__apply_transaction_balance_effect(tx transactions, direction integer)` (`018:5`, replaced at `030:54`):
    - `income` → credit `destination_account_id` by `amount * direction`.
    - `expense` → debit `source_account_id` by `amount * direction`.
    - `transfer` → debit `source_account_id` by `(amount + COALESCE(fee_amount,0)) * direction`; credit `destination_account_id` by `amount * direction` (`030:93-106`). Fees leave the system entirely.
    - `adjustment` → debit/credit whichever leg is non-null.
- `__sync_account_balance_from_transactions()` (`018:79`):
    - INSERT → effect with `+1`.
    - UPDATE → effect with `-1` on OLD then `+1` on NEW (`018:90-91`).
    - DELETE → effect with `-1`.
- Trigger `__trigger_sync_account_balance_from_transactions` (`018:106`) runs `AFTER INSERT OR UPDATE OR DELETE` on `transactions`.

Generated type: `Transactions` at `db/kysely/types.mts:224`.

### Related tables

- `transaction_attachments` (migration `029:13`) — composite PK `(transaction_id, file_id)`; both FKs cascade. Populated by `attachFilesToTransaction` (`procedures/file/attach.mts`).
- `idempotency_keys` (migration `034_idempotency_keys.mts`) — backs the `withIdempotency` helper.

## Domain math / invariants

- A transaction's `space_id` is a **categorization tag**, not a scope boundary (`utils/resolveTransactionSpaceIntegrity.mts:5-15`). The integrity guard only requires that one of source/destination is shared into `space_id`; analytics still treat space scope via the `space_accounts` join, not `transactions.space_id`.
- Adjustments cannot be created at-rest by the user — the only path is `transaction.adjust`, which inserts a row whose direction is implied by the new-vs-current delta. Editing an `adjustment` row via `transaction.update` is technically allowed but the amount and direction are not auto-recomputed.
- There is no available-balance check anywhere in the mutation path. Orbit's job is to record reality, not to second-guess it — accounts may go negative through expenses, transfers, or edits. The web new/edit sheets render an inline overspend hint (see `SourceOverspendHint` in `apps/web/src/features/transactions/NewTransactionSheet.tsx`) so the user notices typos without being blocked.
- Fees count as expense everywhere downstream (`030:18-19`). The `topCategories`, `categoryBreakdown`, `cashFlow`, and `transactionFilteredTotals` SQL all `UNION ALL` a row of `(fee_expense_category_id, fee_amount)` into the expense population — see the analytics module doc for the canonical pattern.

## Conventions & gotchas

- All four creation paths are wrapped in `withIdempotency`. Pass an `idempotencyKey` UUID from the client when the user might retry; the response is cached keyed on `(user_id, operation, key)`.
- There is no budget gate on any creation path — overspend is recorded and surfaced in analytics, never blocked. (The old strict-mode `resolveStrictGate` was removed in `048_simplify_budgeting.mts`.)
- `updateTransaction` doesn't let you change `type`. If you need to convert (say expense → transfer), delete and re-create.
- The `type` column is a Postgres enum but the codegen represents it as `ArrayType<...>` — code throughout the module casts string literals via `"income" as unknown as Transactions["type"]`. Don't try to import the enum at runtime.
- `transaction.list` orders by `id DESC` (not `transaction_datetime`); because ids are uuidv7 they're insertion-time-ordered, but that's NOT the same as `transaction_datetime` (the user-supplied event time). Treat the list order as "newest entered first".
- `list.mts` and `filteredTotals.mts` duplicate the same WHERE clause. When adding a filter, update both — the comment on `filteredTotals.mts:10` explicitly calls out that they must stay in sync.
- The balance trigger uses `direction integer`, so passing `direction=-1`/`+1` controls the sign. There is no soft-delete; trigger DELETE always reverses.

## Cross-references

- Transaction permission: `procedures/transaction/utils/resolveTransactionPermission.mts:8` — the income-into-shared-account and transfer-into-viewer-account rules live here.
- Analytics consumers: nearly every procedure in `analytics/` reads `transactions` and folds in fees the same way (see analytics module doc).
- Event linkage: `event.delete` does NOT cascade — the `event_id` FK is `ON DELETE set null` (migration `0013:26-27`), so deleting an event leaves its transactions intact.
- Closed-event guard on **create paths only** — `expense.mts:75`, `income.mts:55`, `transfer.mts:85` pass `requireActive: true` to `resolveEventBelongsToSpace`. `update.mts` deliberately omits the flag so a row written when an event was active remains editable after the event closes.
- Pin coupling: the new-transaction form pre-hydrates fields from the `pin` router. The server doesn't read pins during transaction creation — pins are hydrate-only on the client. See the pin module doc.
