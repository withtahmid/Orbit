# account module (server)

> Bank/wallet/liability accounts owned by users and shared into one or more spaces; balances are maintained on `account_balances` by a Postgres trigger off `transactions`.

## Router
- File: `apps/server/src/routers/account.mts`
- Composes procedures (`apps/server/src/routers/account.mts:15`):
  - `create` — create an account, link to the caller's space, install owner ACL.
  - `update` — patch name/color/icon.
  - `addMember` / `removeMember` — manage `user_accounts` ACL rows.
  - `delete` — drop the whole account (cascades to `space_accounts`, `user_accounts`, `account_balances`).
  - `listBySpace` — accounts shared into a space (with caller role, owners, balance).
  - `listByUser` — accounts the caller is on, grouped with the spaces they share into.
  - `listUsers` — `user_accounts` roster for an account.
  - `listSpaces` — spaces this account is shared with (caller's space role surfaced).
  - `listShareableForSpace` — accounts the caller owns that could be added to a target space.
  - `shareWithSpace` / `unshareFromSpace` — manage `space_accounts` rows.

## Procedures
- **`createAccount`** (`procedures/account/create.mts:10`) — Auth: authorized, requires space `owner`. Input: `{ space_id, name, account_type: "asset"|"liability"|"locked", color?, icon? }`. Atomically inserts `accounts`, a `user_accounts` row (`role=owner` for caller), a `space_accounts` link, and a `account_balances` seed of 0.
- **`updateAccount`** (`procedures/account/update.mts:10`) — Auth: `user_accounts.role=owner`. Input: `{ accountId, name?, color?, icon? }`, at least one field required. Bumps `updated_at`.
- **`addMemberToAccount`** (`procedures/account/addMember.mts:9`) — Auth: account `owner`. Input: `{ accountId, users: [{id, role: "owner"|"viewer"}] }`. Upserts into `user_accounts` with `ON CONFLICT (account_id, user_id) DO UPDATE` so role changes are idempotent.
- **`removeMemberFromAccount`** (`procedures/account/removeMember.mts:8`) — Auth: account `owner`. Bulk-deletes `user_accounts` rows for `(accountId, userId in [...])`. No safeguard against removing the last owner — caller must enforce that.
- **`deleteAccount`** (`procedures/account/delete.mts:8`) — Auth: account `owner`. Deletes the `accounts` row inside a transaction; FKs cascade to balance/membership/sharing rows. Will fail (FK RESTRICT) if any `envelop_allocations.account_id` or `plan_allocations.account_id` still references it (see migration `025_allocation_account.mts:19`).
- **`listAccountsBySpace`** (`procedures/account/listBySpace.mts:20`) — Auth: any space role. Returns one row per account in the space with `{id, name, account_type, color, icon, balance, myRole, owners[]}`. Two queries (accounts + owner rollup), joined in app code.
- **`listAccountsByUser`** (`procedures/account/listByUser.mts:15`) — Auth: authorized (any). Lists every account in `user_accounts` for the caller, attaching only spaces the caller is also a member of. Spaces the account is shared into but the caller isn't in are aggregated into an opaque `otherSpacesCount` to avoid leaking space names.
- **`listUsersHaveAccessToAccount`** (`procedures/account/listUsers.mts:6`) — Auth: authorized (no ACL check — relies on UUID guessability). Returns the full `user_accounts` roster joined with `users`.
- **`listAccountSpaces`** (`procedures/account/listSpaces.mts:13`) — Auth: account `owner` or `viewer`. Lists `space_accounts` for the account with caller's per-space role.
- **`listAccountsShareableForSpace`** (`procedures/account/listShareableForSpace.mts:13`) — Auth: target space `owner`/`editor`. Returns accounts the caller owns (`user_accounts.role=owner`) that are not yet in the target space.
- **`shareAccountWithSpace`** (`procedures/account/shareWithSpace.mts:19`) — Auth: account `owner` AND target space `owner`/`editor`. Inserts `space_accounts(accountId, spaceId)`. Throws `CONFLICT` if already shared.
- **`unshareAccountFromSpace`** (`procedures/account/unshareFromSpace.mts:17`) — Auth: account `owner` OR space `owner`. Refuses if it would leave the account in zero spaces (`BAD_REQUEST` "delete the account instead"). Refuses if the space still has any `transactions`, `envelop_allocations`, or `plan_allocations` referencing the account (`procedures/account/unshareFromSpace.mts:90-127`).

## Database tables
- **`accounts`** (`migrations/0006_create_accounts_table.mts`). `id uuid PK uuidv7`, `name varchar(255)`, `account_type` enum `__type_account_type` (`asset`/`liability`/`locked`), `updated_at`. `color varchar(7)` and `icon varchar(48)` added in `022_add_colors_and_icons.mts:25` with default `#10b981`/`wallet`.
- **`space_accounts`** (`migrations/0007_create_space_accounts_table.mts`). Composite PK `(account_id, space_id)`. Both FKs `ON DELETE CASCADE`. `created_at`. Indexes on each column from `020_create_indexes.mts:77`.
- **`user_accounts`** (`migrations/0008_create_user_accounts_table.mts`). Composite PK `(user_id, account_id)`. Role enum `__type_account_user_role` (`owner`/`viewer` — NO `editor` here, unlike `space_members`). Both FKs `ON DELETE CASCADE`.
- **`account_balances`** (`migrations/0009_create_account_balance_table.mts`). One row per account (`account_id UNIQUE`, FK `ON DELETE CASCADE`). `balance numeric(20,2)`. Maintained by trigger `__trigger_sync_account_balance_from_transactions` (`migrations/018_create_update_account_balance_trigger.mts:106`) which runs `AFTER INSERT/UPDATE/DELETE ON transactions` and applies signed deltas via `__apply_transaction_balance_effect`. Income credits destination, expense debits source, transfer does both, adjustment uses whichever account is set.

## Conventions & gotchas
- `account_type` semantics: `asset` and `liability` contribute to spendable balance (liabilities subtracted) in `resolveSpaceUnallocated`; `locked` is excluded entirely (`procedures/allocation/utils/resolveSpaceUnallocated.mts:115-119`). `locked` accounts are still usable for transactions but won't inflate "unallocated cash".
- The two role enums look similar but are distinct: `user_accounts.role` is `owner|viewer` only; `space_members.role` is `owner|editor|viewer`. Edit access to a space ≠ edit access to its accounts — account-level edits require an explicit `user_accounts` row.
- An account can be visible in a space (via `space_accounts`) without the caller having any `user_accounts` row — they can transact against it but cannot rename/share/delete (`procedures/account/listBySpace.mts:8-18`).
- The balance trigger writes via `INSERT ... ON CONFLICT (account_id) DO UPDATE`, so `account_balances` rows can be auto-created if missing. `create.mts:57` still pre-seeds the row to keep `listBySpace` `LEFT JOIN`s deterministic.
- `unshareFromSpace` will refuse on dangling allocations/transactions — this is the canonical pattern for "soft FK across the space boundary"; the actual FK on `envelop_allocations.account_id` is `ON DELETE RESTRICT` (`migrations/025_allocation_account.mts:21`).
- Do not commit `db/kysely/types.mts` by hand; regenerate via `pnpm generate-types`.

## Cross-references
- `apps/server/src/procedures/space/utils/resolveSpaceMembership.mts` — used by every space-scoped endpoint.
- `procedures/transaction/*` — sole writer of `transactions`; the only path that mutates `account_balances`.
- `procedures/allocation/utils/resolveSpaceUnallocated.mts` — interprets `account_type` for the unallocated rollup.
- `contexts/modules/server/envelop.md`, `contexts/modules/server/plan.md` — the consumers of `account_id` on allocations.
