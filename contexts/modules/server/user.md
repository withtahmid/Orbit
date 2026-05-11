# user module (server)

> Authenticated user account management. Currently only exposes avatar updates — name/email/password changes are handled by the `auth` module (password reset) or not yet implemented.

## Router
- File: `apps/server/src/routers/user.mts:4`
- Composes procedures:
  - `user.updateAvatar` — set or clear the current user's `avatar_file_id`.

## Procedures
- **`updateAvatar`** (`procedures/user/updateAvatar.mts:6`) — Auth: authorized. Input: `{ fileId: uuid | null }`. Output: `{ avatar_file_id }`. If `fileId` is non-null, validates that the file row exists, was uploaded by the current user (`uploaded_by = ctx.auth.user.id`), has `purpose = 'avatar'`, and `status = 'confirmed'` — throws `NOT_FOUND` / `BAD_REQUEST` otherwise. Then writes `users.avatar_file_id = fileId` (or `null` to clear).

## Database tables
This module reads/writes only `users.avatar_file_id`; the file row itself is owned by the `file` module.

- **`users`** (`migrations/0001_create_users_table.mts`, modified by `migrations/029_add_attachment_tables.mts`). Relevant columns:
  - `id uuid PK`
  - `email varchar(255) UNIQUE`, `password_hash`, `first_name`, `last_name`, `created_at`
  - `avatar_file_id uuid REFERENCES files(id) ON DELETE SET NULL` — added in migration 029; the original `avatar_url` column was dropped in the same migration.

## Conventions & gotchas
- There is **no** `updateProfile`, `changePassword`, `changeEmail`, or `deleteAccount` procedure today. Password changes go through the public `auth.resetPassword.*` flow (which requires email verification, not the current password). If a feature asks for an in-app password change, it does not exist yet.
- The avatar file must already have been uploaded and confirmed via `file.createUploadUrl` + `file.confirm` before `updateAvatar` accepts it. The confirm step also produces the `-sm` thumbnail variant (`procedures/file/confirm.mts:62`), so the avatar is only safely renderable after that.
- The procedure does **not** delete or unlink the previous avatar file; that file row stays in `files` (orphaned from `users.avatar_file_id`'s perspective). A cleanup sweep is the assumed garbage-collection mechanism.
- The DB FK uses `ON DELETE SET NULL` — deleting the `files` row will null out `avatar_file_id` automatically. Conversely, deleting the `users` row currently has no path through this module (and `users` has FK constraints from other tables; see `027_fk_on_delete_restrict_for_created_by.mts`).
- Avatar validation casts to `unknown as string` because the codegen-generated `purpose`/`status` types are `ArrayType<...>` unions (`db/kysely/types.mts:141`) — see the same pattern in `file/confirm.mts`. Don't try to "fix" those casts without regenerating types and confirming the pattern across the module.

## Cross-references
- `contexts/modules/server/file.md` — owns the `files` table, presigned upload URL, and the avatar `-sm` variant generation that `updateAvatar` depends on.
- `contexts/modules/server/auth.md` — owns `users` row creation (`completeSignup`), email lookup (`findUserByEmail`), and password reset.
- `apps/server/src/trpc/middlewares/authorized.mts` — the auth gate this module's only procedure runs behind.
