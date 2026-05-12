---
name: jwt_lifecycle
description: JWTs are unbounded and unrevokable — password change, email change, and account deletion all leave existing tokens valid.
metadata:
  type: project
---

Observations from `apps/server/src/trpc/auth.mts`:
- `signJWT` calls `jwt.sign(payload, ENV.JWT_SECRET)` with no `expiresIn` option, so tokens never expire.
- The payload is just `{ userId }` — no `tokenVersion`, `iat` enforcement, or password-change epoch.
- `fetchUserFromJWT` does **not** verify the user row still exists; the DB lookup is commented out. So a token referencing a deleted `userId` still authenticates.

**Why:** Likely simplest-thing-that-could-possibly-work auth from early in the project; nothing has forced a revisit yet.

**How to apply:** Any new "destructive to session" mutation ([[user_change_password]], [[user_delete_account]], [[user_change_email]]) must either be flagged as not actually invalidating concurrent sessions, or trigger a real revoke mechanism (token version column on users, refresh-token table, etc.). If a reviewer claims `changePassword` "revokes other sessions," that is false in this codebase as of branch `wrap`.
