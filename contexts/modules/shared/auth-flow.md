# Auth flow

> End-to-end auth: signup OTP, login, password reset; web stores manage three separate localStorage tokens depending on flow.

## Components

Server procedures (one-per-file under `apps/server/src/procedures/auth/`):

- `login.mts` — email/password → permanent JWT.
- `me.mts` — `authorizedProcedure` returning the current user row.
- `signup/initiate.mts`, `signup/verifyCode.mts`, `signup/complete.mts`, `signup/resendCode.mts`.
- `signup/helper.mts` — `signTmpJWT` / `authorizeTmpJWT`; the same helper is reused by the reset-password procedures.
- `resetPassword/initiate.mts`, `resetPassword/verifyCode.mts`, `resetPassword/complete.mts`, `resetPassword/resendCode.mts`.
- `auth/users/findByEmail.mts`, `auth/utils/generateOTP.mts`.
- Router: `apps/server/src/routers/auth.mts` (mounts the four sub-trees).

JWT helpers and middleware:

- `apps/server/src/trpc/auth.mts:11` — `signJWT({ userId })` (no expiry).
- `apps/server/src/trpc/middlewares/public.mts` — base procedure with demo-filter + mutation-logger.
- `apps/server/src/trpc/middlewares/authorized.mts:10` — `authorizedProcedure`, rejects with `UNAUTHORIZED` if `ctx.auth.user` is null.

Web:

- Stores: `apps/web/src/stores/{AuthStore,SignupStore,ForgotPasswordStore}.ts`.
- Pages: `apps/web/src/pages/auth/LoginPage.tsx`, `apps/web/src/pages/auth/signup/{index,EmailStep,VerifyStep,DetailsStep}.tsx`, `apps/web/src/pages/auth/forgot-password/{index,EmailStep,VerifyStep,NewPasswordStep}.tsx`.
- Guards: `apps/web/src/router/guards/{GuestOnlyRoute,ProtectedRoute}.tsx` (no `PublicRoute` — public routes are simply un-guarded).
- Token rotation in tRPC client: `apps/web/src/trpc.ts:9-22` reads `auth_token` → `signup_token` → `password_reset_token`.

Email template + config:

- `apps/server/src/services/mail/templates/VerificationCodeEmail.tsx` (single template reused by signup + reset).
- `apps/server/src/config/config.mts` — `CONFIG.AUTH.{SALT_ROUNDS:12, OTP_EXPIRY_MINUTES:10, RESEND_COOLDOWN_SECONDS:60}`.

Tables (migrations `0001`, `0002`, `0003`):

- `users` (id, email, password_hash, first_name, last_name, avatar_file_id).
- `tmp_users` (id, email, is_email_verified) — short-lived pre-signup row.
- `email_verification_codes` (user_id XOR tmp_user_id, purpose enum: `signup` | `password_reset` | `change_email`, code, expires_at). Check constraint enforces `signup → tmp_user_id only`, `password_reset → user_id only`.

## Flow

### Signup (3 steps, 3 different tokens)

1. **Email step** (`signup/EmailStep.tsx:15`) calls `auth.signup.initiate`. Server (`signup/initiate.mts:24`) refuses if `users.email` already exists, then in one transaction deletes any prior `tmp_users` for that email, inserts a fresh `tmp_users` row, generates a 6-digit OTP via `generateOTP.mts`, and inserts it into `email_verification_codes` with `purpose='signup'`. Mailer sends `VerificationCodeEmail`. Returns `signTmpJWT({tempUserId, purpose:"signup"}, 15*60)` (15 min). Client stores under `signup_token` (`SignupStore.setSignupToken` → `localStorage`).
2. **Verify step** (`signup/VerifyStep.tsx:33`) auto-submits on 6 digits. `auth.signup.verify` (`signup/verifyCode.mts:14`) requires `purpose === "signup"` on the tmp JWT, matches the latest non-expired code, deletes the code, flips `tmp_users.is_email_verified = true`, and returns a fresh JWT with `purpose:"signup-verified"` (30 min). Client overwrites `signup_token`.
3. **Details step** (`signup/DetailsStep.tsx:48`) collects first/last name + password. `auth.signup.complete` (`signup/complete.mts:30`) requires `purpose === "signup-verified"`, hashes the password with `bcrypt` at `CONFIG.AUTH.SALT_ROUNDS=12`, inserts the `users` row reusing `tmp_users.id` as the new user id (`signup/complete.mts:55-58`), deletes the `tmp_users` row, and returns a permanent JWT (`signJWT({userId})`). Client calls `authStore.setAuth(...)`, which persists `auth_token` + `auth_user`, then `signupStore.reset()` clears the signup token.

Resend (`signup/resendCode.mts`) enforces `RESEND_COOLDOWN_SECONDS=60` since the last `email_verification_codes.created_at`.

### Login

`LoginPage.tsx:21` → `auth.login` (`login.mts:29`). Server selects user by email, `bcrypt.compare`, signs a permanent JWT, returns `{ token, user: { id, email, firstName, lastName, avatar_file_id } }`. Client maps `firstName + lastName → name` and stores via `AuthStore.setAuth`.

### Password reset

1. `resetPassword/initiate.mts:42-48` — if no user matches, returns `{ token: null, message }` to avoid leaking account existence; only triggers next step when token is present (`forgot-password/EmailStep.tsx:20`). Signs `purpose:"password-reset"` JWT (15 min). Stored under `password_reset_token` key.
2. `resetPassword/verifyCode.mts:69-72` — on match, signs `purpose:"password-reset-verified"` JWT (30 min).
3. `resetPassword/complete.mts:29` — requires `purpose === "password-reset-verified"`, hashes new password, updates `users.password_hash`. Client navigates to `/login` (no auto-login); user types credentials.

## Conventions & gotchas

- Three distinct localStorage keys (`auth_token`, `signup_token`, `password_reset_token`). The tRPC client picks the first non-empty one in that order on every request (`apps/web/src/trpc.ts:9-22`). If a stale `signup_token` lingers, it can mask `auth_token` lookup — always call `signupStore.reset()`/`forgotPasswordStore.reset()` on completion.
- `auth_user` is a second localStorage entry (`AuthStore.ts:43`) rehydrated alongside the token; `setAvatarFileId` keeps it in sync after profile edits.
- The "tmp" JWT helper (`signup/helper.mts:7`) carries a `purpose` enum and is reused for both signup phases AND the reset flow. Every consumer checks the literal `purpose` string — DO NOT change one without updating both.
- `fetchUserFromJWT` (`trpc/auth.mts:35-55`) currently does NOT touch the DB; it trusts the JWT payload. A user with a valid token whose row was deleted will still pass the `authorized` middleware — only the per-procedure `users` lookup will fail. The DB lookup is intentionally commented out.
- `signJWT` does not set `expiresIn` — auth tokens are effectively permanent until the user logs out (`AuthStore.clearAuth`).
- Signup re-uses `tmp_users.id` as the new `users.id` (`signup/complete.mts:55-58`). This collapses two PK spaces into one; do not assume tmp ids vanish on completion.

## Cross-references

- `./trpc-setup.md` — how `authorizedProcedure` wires `ctx.auth.user`.
- `./stores.md` — MobX store wiring for tokens.
- `./routing.md` — `GuestOnlyRoute` / `ProtectedRoute` consult `authStore.isAuthenticated`.
- `./db-layer.md` — `safeAwait` + transaction patterns used inside every auth procedure.
