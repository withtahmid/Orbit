# Wallet Monorepo - Current State (Apr 17, 2026)

This document is the high-signal context snapshot for implementing new features quickly and safely.

## 1) Repository at a glance

- Monorepo: pnpm workspace + Turborepo
- Main apps:
    - `apps/server`: Express + tRPC + Kysely + PostgreSQL
    - `apps/web`: React (Vite) + React Router + tRPC client + React Query + MobX
- Shared packages:
    - `packages/eslint-config`
    - `packages/typescript-config`
    - `packages/ui` (present but not the primary UI used in current web app)

## 2) Tooling and scripts

### Root scripts (`package.json`)

- `pnpm build` -> `turbo run build --env-mode=loose`
- `pnpm dev` -> `turbo run dev --env-mode=loose`
- `pnpm lint` -> `turbo run lint`
- `pnpm check-types` -> `turbo run check-types`

### Server scripts (`apps/server/package.json`)

- `pnpm dev` (from server package) compiles TypeScript and starts nodemon
- `pnpm migrate` runs `src/db/kysely/migrator.mts`
- `pnpm generate-types` runs `kysely-codegen` to regenerate DB types

### Web scripts (`apps/web/package.json`)

- `pnpm dev` -> Vite dev server
- `pnpm build` -> `tsc -b && vite build`

## 3) Runtime architecture

## 3.1 Backend request flow

1. App boot starts in `apps/server/src/index.mts`
2. Runs `run_bootstrap()` (currently logs only; migration call is commented out)
3. Creates Express app with `cors()` and `express.json()`
4. Mounts tRPC middleware at `/trpc`
5. In development mode, mounts tRPC playground at `/trpc-playground`
6. Listens on `ENV.PORT` (default 3000)

### Environment (`apps/server/src/env.mts`)

- `PORT` (default 3000)
- `DATABASE_URL` (defaults to docker postgres URL)
- `NODE_ENV`
- SMTP vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `JWT_SECRET`

### tRPC context (`apps/server/src/trpc/context.mts`)

- Context includes:
    - `auth.user` from JWT (or `null`)
    - `services` object (pg pool, kysely qb, mailer)
- JWT decode currently resolves user as `{ id: payload.userId }` without DB existence check (DB fetch is commented out)

## 3.2 Frontend runtime flow

1. `apps/web/src/main.tsx` renders `<App />`
2. `App.tsx` provides tRPC + React Query + Router
3. Router and guards control public/guest/protected pages
4. Auth/session state uses MobX stores + localStorage tokens

## 4) Backend API surface (tRPC routers)

Main router in `apps/server/src/routers/index.mts`:

- `health`
- `auth`
- `space`
- `account`
- `event`
- `envelop`
- `plan`
- `expenseCategory`
- `transaction`

## 4.1 Auth router

- `auth.signup.initiate`
- `auth.signup.resendCode`
- `auth.signup.verify`
- `auth.signup.complete`
- `auth.login`
- `auth.resetPassword.initiate`
- `auth.resetPassword.resendCode`
- `auth.resetPassword.verify`
- `auth.resetPassword.complete`
- `auth.findUserByEmail` (authorized)

### Auth flow notes

- Login returns `{ token, user }`, token expires in 7 days.
- Signup and reset-password use temporary JWTs and OTP records (`email_verification_codes`).
- Purpose values in temp token flow include:
    - `signup`
    - `signup-verified`
    - `password-reset`
    - `password-reset-verified`

## 4.2 Domain routers

### Space

- `space.create`
- `space.update`
- `space.memberList`
- `space.list`
- `space.addMembers`
- `space.removeMember`
- `space.changeMemberRole`
- `space.delete`

### Account

- `account.create`
- `account.update`
- `account.addMember`
- `account.removeMember`
- `account.delete`
- `account.listBySpace`
- `account.listByUser`
- `account.listUsers`

### Event

- `event.listBySpace`
- `event.create`
- `event.update`
- `event.delete`

### Envelop

- `envelop.create`
- `envelop.update`
- `envelop.delete`
- `envelop.listBySpace`
- `envelop.allocationCreate`
- `envelop.allocationDelete`
- `envelop.allocationListBySpace`

### Plan

- `plan.create`
- `plan.update`
- `plan.delete`
- `plan.listBySpace`

### Expense Category

- `expenseCategory.create`
- `expenseCategory.update`
- `expenseCategory.changeParent`
- `expenseCategory.delete`
- `expenseCategory.listBySpace`

### Transaction

- `transaction.income`
- `transaction.expense`
- `transaction.transfer`
- `transaction.adjust`
- `transaction.listBySpace`

## 5) Authorization and permission model

- `authorizedProcedure` middleware:
    - rejects unauthenticated with `UNAUTHORIZED`
    - applies mutation logger middleware

- Space permission helper:
    - `resolveSpaceMembership(...)`
    - checks space exists + user role in allowed roles

- Account permission helper:
    - `resolveAccountPermission(...)`
    - checks account exists + user role in allowed roles

- Transaction permission helper:
    - `resolveTransactionPermission(...)`
    - enforces per-transaction-type account role requirements
    - transfer rules are stricter and include destination access constraints

## 6) Database state (PostgreSQL + Kysely)

Generated DB types are in `apps/server/src/db/kysely/types.mts`.

Core tables currently present:

- `users`
- `tmp_users`
- `email_verification_codes`
- `spaces`
- `space_members`
- `accounts`
- `space_accounts`
- `user_accounts`
- `account_balances`
- `envelops`
- `events`
- `expense_categories`
- `transactions`
- `envelop_allocations`
- `envelop_balances`
- `plans`
- `plan_allocations`
- `envelop_allocation_consumptions` (in types)

### Important DB behavior

- `transactions` table has check constraints for valid shape by type (`income`, `expense`, `transfer`, `adjustment`).
- Trigger migration `018_create_update_account_balance_trigger.mts` keeps `account_balances` in sync with transaction inserts/updates/deletes.
- Trigger migration `019_create_update_envelop_balance_trigger.mts` keeps `envelop_balances` synced with envelop allocations and expense transactions.

## 7) Frontend app state

## 7.1 Routing

Router defined in `apps/web/src/router/index.tsx`.

Route groups:

- Public: `/`, `/about`
- Guest-only: `/login`, `/signup`, `/forgot-password`
- Protected:
    - `/dashboard`
    - `/profile`
    - `/users/:userId`
    - `/search`
    - `/spaces`
    - `/spaces/:id`
    - `/spaces/:id/accounts/:accountId`
    - `/spaces/:id/transactions`
    - `/space/:id/edit`
    - `/settings` (+ nested children)

Guards:

- `PublicRoute`: pass-through
- `GuestOnlyRoute`: redirects authenticated users
- `ProtectedRoute`: redirects unauthenticated users to login with `?from=`

## 7.2 Stores and localStorage keys

- `AuthStore`:
    - localStorage keys: `auth_token`, `auth_user`
    - computed: `isAuthenticated`
- `SignupStore`:
    - key: `signup_token`
    - tracks multi-step signup state + cooldown
- `ForgotPasswordStore`:
    - key: `password_reset_token`
    - tracks reset flow step + cooldown

## 7.3 Frontend -> backend integration

`apps/web/src/trpc.ts`:

- uses `httpBatchLink` to `${baseBackendURL}/trpc`
- header strategy:
    - first prefers `auth_token`
    - then `signup_token`
    - then `password_reset_token`

This allows multi-step auth flows to call APIs requiring temporary tokens.

## 7.4 Feature completeness status (UI)

Implemented with real tRPC calls:

- Auth flows (login/signup/forgot password)
- Space management
- Space members management
- Account management in a space
- Event management
- Envelop + envelop allocation management
- Plan management
- Expense category management
- Transaction creation and listing with filters

## 8) Infra and local environment

`docker-compose.yml` defines:

- `db` (postgres:18, exposed on `5432`)
- `maildev` (UI `1080`, SMTP `1025`)
- `metabase` (`3001`)
- `orbit` app container running `pnpm dev`

`Dockerfile` is minimal node image with global pnpm installation.

## 9) Known gotchas and inconsistencies

These are important when implementing new features:

- Root `README.md` is still mostly default Turborepo starter text, not project-specific documentation.
- `run_bootstrap` has migration call commented out; DB migrations are not auto-run on server boot.
- Mutation logger middleware builds structured log payload but DB insert is commented out.
- `createMailService()` has unreachable logger statement after `return`.
- `apps/server/src/utils/generateId.mts` exists but is empty.
- Enum typing/codegen gotcha:
    - generated Kysely enum fields often appear as array-ish types (`ArrayType<...>`).
    - current code frequently uses casts like `as unknown as SpaceMembers["role"]` and `where ... in [...]` to avoid type friction.
- UUID/migrations gotcha:
    - migrations rely on `uuidv7()`; ensure DB/runtime supports it (PG version/extension alignment).
- Frontend path typo in repo structure naming:
    - file is `apps/web/src/hooks/Useappnavigate.ts` (nonstandard capitalization).

## 10) Conventions to follow for new features

Backend:

- Add new procedure in `apps/server/src/procedures/<domain>/...`
- Register it in domain router under `apps/server/src/routers/<domain>.mts`
- Use `authorizedProcedure` unless endpoint is truly public.
- Use `safeAwait` + normalized `TRPCError` handling pattern used in current codebase.
- Put authorization checks up front using existing helpers (`resolveSpaceMembership`, `resolveAccountPermission`, etc.).

Database:

- Add migration under `apps/server/src/db/kysely/migrations`
- Keep Kysely types in sync via `pnpm generate-types` in server package.
- If schema changes touch nullability or enums, update:
    - migration
    - backend zod schemas
    - frontend payload expectations
    - generated DB types

Frontend:

- Add calls through existing typed `trpc` client (`apps/web/src/trpc.ts`).
- Keep paths centralized via `ROUTES` in `apps/web/src/router/routes.ts`.
- Use existing page patterns for status/error feedback and query invalidation.

## 11) Recommended implementation checklist for any new feature

1. Define data model change (if needed) + migration.
2. Add/update backend procedure with zod input/output.
3. Add router wiring.
4. Add frontend query/mutation usage and UI wiring.
5. Invalidate/refetch relevant queries after mutation.
6. Verify role/permission path (space/account ownership rules).
7. Update this context file if feature changes core architecture or flows.

## 12) Quick mental model for LLM feature work

- This project is API-first via tRPC.
- Most business operations are permission-gated by space/account membership.
- Transactions and envelop/account balances depend heavily on DB triggers.
- Auth is token-based with both long-lived auth JWT and short-lived flow JWTs.
- Frontend is mostly functional and feature-rich in dashboard pages; use existing pages as implementation templates.
