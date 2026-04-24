# Orbit — Engineering Specification

> Companion to [`project-specification.md`](./project-specification.md).
> That doc is the **product & domain** source of truth (what Orbit *is*).
> This doc is the **engineering** source of truth (how Orbit *runs*). If a
> fact here contradicts the code, the code wins — flag the drift so the
> spec gets updated.

**Last rewritten:** 2026-04-21. Orbit is deployed to production at
[orbit.withtahmid.com](https://orbit.withtahmid.com).

---

## 1. Deployment topology

Orbit is split across three managed platforms, each doing one job well:

| Surface | Platform | What's deployed | Entry / URL |
|---|---|---|---|
| Web app | Cloudflare Pages | Pre-built Vite bundle from `apps/web/dist` | [orbit.withtahmid.com](https://orbit.withtahmid.com) |
| tRPC API | Vercel (serverless) | `apps/server` compiled ESM, exported from [`index.mts`](../apps/server/src/index.mts) as `export default app` | `VITE_BACKEND_URL` (injected at web build) |
| Object storage | Cloudflare R2 | Avatars, attachments, exported reports — bucketed by `purpose/<uuid>` R2 keys | `R2_BUCKET`, optional public base via `R2_PUBLIC_URL_BASE` |
| Database | Managed Postgres 18 | All tables in `apps/server/src/db/kysely/migrations/` | `DATABASE_URL` |
| Email | SMTP provider | Transactional (verification, welcome, password reset) | `SMTP_*` env |

**Why this split**: the web bundle is pure static, so Pages is the right
edge host. The API is I/O-bound Postgres work with spiky traffic —
Vercel serverless gives per-request scaling. R2 keeps object-storage
cost flat and the API stateless.

### 1.1 Request lifecycle (web → API)

1. Browser loads static assets from Cloudflare Pages.
2. React mounts; `AuthStore` hydrates token from `localStorage`.
3. `trpc.ts` composes an `httpBatchLink` to `VITE_BACKEND_URL/trpc`;
   every batch prepends `Authorization: Bearer <token>`, trying
   `auth_token → signup_token → password_reset_token` in order.
4. Vercel serverless fn boots, runs `createServices()` once per
   cold-start (pg pool + Kysely builder + R2 client + mailer), then
   `createContext` per request (JWT → user).
5. Procedure runs, returns JSON; tRPC/React-Query memoizes by input hash.

### 1.2 Cold-start discipline

The Vercel entrypoint is `apps/server/src/index.mts`. It
[guards the `app.listen` with `if (!process.env.VERCEL)`](../apps/server/src/index.mts)
so the same module works in Docker (long-lived) and on Vercel
(serverless). `run_bootstrap()` logs but does **not** auto-run
migrations — migrations are a human-initiated step.

---

## 2. Repo layout (Turborepo + pnpm)

```
apps/server          tRPC API
apps/web             Vite/React SPA
packages/*           workspace stubs (eslint, tsconfig, ui) — intentionally thin
contexts/            non-code context (product spec, engineering spec)
.github/workflows/   deploy-server.yml, deploy-web.yml
docker-compose.yml   orbit + postgres + maildev + metabase
```

`turbo.json` drives the multi-package `dev`, `build`, `check-types`,
`lint`. `pnpm-workspace.yaml` enumerates the packages. Node 22 on CI;
Node ≥ 20 locally.

---

## 3. Server runtime

### 3.1 Module system

ESM-only. Source is `.mts`, compiled by `tsc` to `.mjs` in `dist/`.
**Imports between source files use `.mjs` extensions** at the call site
(TypeScript resolves them; Node's ESM loader requires them verbatim).
Changing this breaks both dev (nodemon reload) and prod (Vercel bundle).

### 3.2 Process model

Dev: `tsc --watch` → `dist/`, `nodemon --watch dist --delay 200ms` →
Node. Prod (Vercel): the whole `apps/server` is built to `dist/` and
the Vercel `@vercel/node` runtime imports the default export.

### 3.3 Context & middlewares

[`trpc/context.mts`](../apps/server/src/trpc/context.mts) creates per-request
`ctx = { auth: {user}, services }` where `services` is a module-scoped
singleton (`pgPool`, `qb`, `mailer`, `r2`). The JWT is verified against
`JWT_SECRET`; the user is fetched by id on every request.

Two procedure builders:

- `publicProcedure` — no auth gate. Used for `auth.*` and `health`.
- `authorizedProcedure` — adds a guard that throws `UNAUTHORIZED` when
  `ctx.auth.user` is null and narrows downstream `user` to
  `AuthenticatedUser`. Chained with `mutationLoggerMiddleware`.

### 3.4 Error & transaction contract

Every mutation that touches > 1 row runs inside
`ctx.services.qb.transaction().execute(trx => …)` wrapped in `safeAwait`
(returns `[err, ok]`). On error:

- Re-throw `TRPCError` as-is (preserves `code` to the client).
- Wrap anything else as `INTERNAL_SERVER_ERROR`, passing the original
  `.message` along so the client-side error banner is useful.

Reads skip the transaction wrapper; they use `ctx.services.qb` directly.

### 3.5 Auth flow

- **Signup** is multi-step: `auth.signup.request` creates a `tmp_users`
  row and emails a 6-digit code; `auth.signup.verify` consumes the code
  and materializes a real `users` row + issues a JWT.
- **Login**: email+password → JWT. Passwords hashed with bcrypt.
- **Password reset** follows the same code→verify→set pattern against
  `email_verification_codes` with a distinct purpose column.
- Email codes expire in short windows; consumed codes are deleted.

### 3.6 Postgres session setup

Every pool connection runs `SET TIME ZONE <APP_TIMEZONE>` so
`DATE_TRUNC('month', NOW())` and `::date` casts all resolve in the app
zone. `APP_TIMEZONE` default is `Asia/Dhaka` (UTC+06:00, no DST).
Changing the env requires a cold restart.

### 3.7 Triggers & computed state

Canonical list of materialized state maintained by the DB:

| Table / column | Maintained by | Migration |
|---|---|---|
| `account_balances.balance` | `__trigger_sync_account_balance_from_transactions` on INSERT/UPDATE/DELETE of `transactions` — updated in 030 to also debit `fee_amount` from source on transfers | 018, 030 |

Everything else — envelope periods, plan totals, space unallocated,
drift, analytics — is computed on-read. **Retired**: `envelop_balances`
and `plan_balances` (and their triggers) in migration 026.

**Transfer fees** (migration 030) — `transactions.fee_amount` +
`transactions.fee_expense_category_id` are a first-class column pair
gated by a `CHECK` constraint (both NULL, or both populated with
`fee_amount > 0 AND type = 'transfer'`). The balance-sync trigger
debits the source by `amount + fee_amount` and credits the destination
the plain `amount`; the fee is money that left the ledger for the
bank / ATM / processor. Every expense-centric analytics procedure
(`topCategories`, `categoryBreakdown`, `envelopeUtilization`,
`accountAllocation`, `cashFlow`, `spendingHeatmap`, `spaceSummary`'s
`periodExpense`) and their `personal.*` twins `UNION ALL` the fee rows
into their expense sums, keyed by `fee_expense_category_id`. See
project spec §11.6 for the full semantics and UX.

---

## 4. Database

### 4.1 Toolchain

- Driver: `pg.Pool` (connection pool sized by default).
- Query builder: **Kysely** (typed, composable).
- Types: **`kysely-codegen`** into
  [`apps/server/src/db/kysely/types.mts`](../apps/server/src/db/kysely/types.mts).
  Never hand-edit; regenerate with `pnpm --filter backend generate-types`
  after every schema change.
- Migrations: Kysely's `FileMigrationProvider` over numbered `.mts` files
  under `apps/server/src/db/kysely/migrations/`.

### 4.2 Migration workflow

```bash
pnpm --filter backend migrate          # apply all up
pnpm --filter backend generate-types   # refresh DB types
pnpm --filter backend seed             # wipe + reseed local DB with demo data
```

Migrations are **append-only**, **reversible** (`up` + `down`), and
**applied manually** — never on app boot. The numbering scheme is
`NNNN_name.mts` (historical files use 4-digit; newer ones 3-digit —
both are valid because Kysely sorts lexically).

### 4.3 Local demo seed

[`apps/server/src/db/kysely/seed.mts`](../apps/server/src/db/kysely/seed.mts)
truncates every product table and inserts a rich demo dataset — 4
users, 3 spaces, 9 accounts, 17 envelopes, 6 plans, ~60 categories,
6 events, and ~800 transactions spread across the last 6 months —
suitable for screenshots and feature demos. Refuses to run when
`NODE_ENV=production`. Deterministic (Mulberry32 PRNG seeded from a
fixed constant) so re-runs produce identical data modulo the anchor
"now" shifting the time window. Account balances are populated via
the existing trigger (018); no special handling needed.

### 4.3 Enum quirk

`kysely-codegen` emits enum columns as `ArrayType<'foo'|'bar'>` which
don't match Kysely's runtime insert types. Workaround: cast at the
insert-value site, e.g. `"expense" as unknown as Transactions["type"]`.
This is deliberate; don't fight the codegen. A future codegen swap will
drop the ~40 casts.

### 4.4 Invariant-bearing constraints

Enforced in-DB (not just app code):

- `transactions` CHECK constraints gate the four type shapes (see
  product spec §3.6).
- `events` CHECK `end_time > start_time`.
- `envelops.cadence` CHECK `in ('none', 'monthly')`.
- `expense_categories.priority` CHECK `in ('essential', 'important', 'discretionary', 'luxury')` (nullable; migration 031). Children with NULL inherit from the nearest ancestor.
- `ON DELETE RESTRICT` on `transactions.created_by`,
  `spaces.created_by`, `spaces.updated_by`,
  `envelop_allocations.created_by`, `plan_allocations.created_by`
  (migration 027) — users who authored ledger rows cannot be silently
  deleted.
- `ON DELETE RESTRICT` on `expense_categories.parent_id` and
  `.envelop_id`, `envelop_allocations.account_id`,
  `plan_allocations.account_id`.

---

## 5. Web runtime

### 5.1 Build

Vite + React 19 + TypeScript. Entry `src/main.tsx` → `src/App.tsx`.
Build is `tsc -b && vite build` into `apps/web/dist/`.

### 5.2 Cross-app type import

[`apps/web/src/trpc.ts`](../apps/web/src/trpc.ts) imports `AppRouter`
directly from `../../server/src/routers/index.mjs`. No codegen, no
schema drift: changing a procedure input on the server is an immediate
compile error on the web. The tradeoff is that `tsc` on the web app
traverses some server code.

### 5.3 State

- **Server state** → TanStack Query via `@trpc/react-query`. Cache keys
  derive from input hashes; `new Date()` in a hook body is a foot-gun
  (§13.6 of the product spec) — freeze with `useState(() => new Date())`.
- **Client state** → MobX (`AuthStore`, `SignupStore`,
  `ForgotPasswordStore`). `AuthStore` owns the `auth_token` in
  `localStorage` and rehydrates at boot; `ProtectedRoute` blocks on
  `isLoading` to prevent a flash-of-redirect.

### 5.4 Date handling at boundaries

tRPC serializes `Date → string` over HTTP. Always `new Date(resp.field)`
before handing to `date-fns`. For display, prefer
[`formatInAppTz`](../apps/web/src/lib/formatDate.ts) which applies
`APP_TIMEZONE` wall-clock so everyone sees the same month boundaries.

### 5.5 Routing

- Declared in [`router/index.tsx`](../apps/web/src/router/index.tsx)
  with three guards: `PublicRoute`, `GuestOnlyRoute`, `ProtectedRoute`.
- Path constants in [`router/routes.ts`](../apps/web/src/router/routes.ts).
  **Never hardcode paths** — use `ROUTES.*(...)` helpers.
- Path alias `@/*` → `src/*` (matched in both `vite.config.ts` and
  `tsconfig`).

### 5.6 Virtual "My money" space (`/s/me`)

The personal (cross-space) view is implemented as a **virtual space**,
not a standalone page. It rides the same `/s/:spaceId` routing tree as
real spaces, using the literal string `"me"` as a sentinel spaceId.
Detected via
[`isPersonalSpaceId`](../apps/web/src/lib/personalSpace.ts).
[`CurrentSpaceProvider`](../apps/web/src/providers/CurrentSpaceProvider.tsx)
short-circuits when it sees `spaceId === "me"` and synthesizes a
`CurrentSpace` with `myRole: "viewer"` (forces read-only through the
existing `PermissionGate`), `isPersonal: true`, and skips the
`space.list` membership check.

The SpaceSwitcher and SpaceSelectorPage inject a "My money" entry
alongside real spaces.
[`SpaceLayout`](../apps/web/src/layouts/SpaceLayout.tsx) filters its
sidebar when `space.isPersonal` to Overview / Accounts / Transactions /
Analytics only (Envelopes / Plans / Categories / Events / Settings are
hidden because those are mutation-oriented spaces-level entities).

**Dispatch pattern**: each consumer page (OverviewPage, AccountsPage,
TransactionsPage, every analytics view) uses **paired queries** — one
variant hitting `analytics.*` / `transaction.*` / `account.*`, the
other hitting `personal.*`, guarded by `{ enabled: !isPersonal }` /
`{ enabled: isPersonal }`. The inactive variant never fires. Output
shapes are aligned so consumer code below the branch is shared.

**Anchor**: `user_accounts.role='owner'` — the user's personally-owned
accounts. Every `personal.*` procedure resolves them via
[`resolveOwnedAccountIds`](../apps/server/src/procedures/personal/shared.mts)
and unions over the caller's `space_members` set via
`resolveMemberSpaceIds`. Membership is re-resolved per request
(defensive: a user removed from a space must not see its transactions
even if they still own an account that was shared into that space
historically).

**Internal-transfer rule**: an owned → owned transfer nets to zero and
is excluded from `personal.summary`'s `periodIncome/Expense` and
`personal.cashFlow` bars. The transaction list keeps the row and tags
it `is_internal_transfer: true` so the UI can render it as rebalancing.

**Shared-space parity (account-flow analytics).** `analytics.cashFlow`,
`analytics.spaceSummary` (`periodIncome` / `periodExpense`),
`analytics.balanceHistory`, and `analytics.spendingHeatmap` all derive
their populations from `space_accounts` rather than the row's
`space_id` tag — the same rule the balance trigger uses to update
`account_balances`. A cross-space transfer (e.g. personal account →
shared family pot) surfaces as **income** on the receiving space even
if the row was stamped with the sender's space_id, which is the
realistic recording flow (users pick the space to keep source-account
privacy, not to categorize the money). Fees follow the source leg: a
transfer's fee counts as a space's expense only when the transfer's
source account is in that space. Category-like analytics
(`categoryBreakdown`, `topCategories`, `envelopeUtilization`,
`planProgress`, `accountAllocation`, `eventTotals`) stay `space_id`-
scoped because the concepts they sum (categories, envelopes, plans,
events) are space-local entities. See project spec §6.5 and §12 for
the full combination table.

**Write-time integrity.** Every transaction creation / update path runs
[`resolveTransactionSpaceIntegrity`](../apps/server/src/procedures/transaction/utils/resolveTransactionSpaceIntegrity.mts):
the chosen `spaceId` must be one of the spaces that source or
destination is shared into. This keeps `space_id` a meaningful tag
(used for category / envelope / event attribution) without rejecting
legitimate cross-space contributions.

**Category priority.** `expense_categories.priority` (migration 031)
classifies categories as `essential / important / discretionary /
luxury`. NULL means "inherit from the nearest ancestor" — so tagging
"Groceries" as essential propagates to every leaf unless a specific
leaf overrides (e.g. "Groceries > Premium Imports" tagged luxury).
Analytics resolves the effective tier via a recursive parent-walk CTE
in `analytics.priorityBreakdown`. Shape chosen over per-envelope
tagging because a single envelope routinely spans tiers (everyday vs
splurge inside the same budget bucket).

**Cross-space envelope/plan math**: `personal.envelopeUtilization` and
`personal.planProgress` restrict allocations and consumed amounts to
partitions whose `account_id` is owned by the caller. The total bars
and breakdown rows both represent "my slice" of each shared envelope.

**Personal procedures** (all in
[`procedures/personal/`](../apps/server/src/procedures/personal/),
composed by
[`routers/personal.mts`](../apps/server/src/routers/personal.mts)):
`summary`, `cashFlow`, `topCategories`, `categoryBreakdown`,
`envelopeUtilization`, `planProgress`, `balanceHistory`,
`spendingHeatmap`, `accountDistribution`, `accountAllocation`,
`transactions` (full filter parity with `transaction.list`,
snake-case shape matching `transaction.listBySpace` so consumers
render unchanged), `listCategories`, `ownedAccounts`.

See project spec §6.5 for the full personal cash-flow table and
product semantics. Legacy `/me` redirects to `/s/me`.

---

## 6. File upload system (R2)

### 6.1 Shape

`files` table (purpose + status) + three junction tables
(`transaction_attachments`, `event_attachments`, `exported_reports`) +
`users.avatar_file_id`. All uploads are **direct to R2 via presigned PUT**
— bytes never touch the API server. Downloads are **presigned GET**
URLs issued per request, scoped by purpose.

### 6.2 Three-step upload

1. `file.createUploadUrl({purpose, mimeType, sizeBytes, originalName})`
   validates against
   [`PURPOSE_LIMITS`](../apps/server/src/procedures/file/shared.mts),
   inserts a `files` row with `status='pending'`, returns a presigned
   PUT URL (10-min TTL).
2. Client `PUT`s the bytes straight to R2.
3. `file.confirm({fileId})` flips to `status='confirmed'` and sets
   `confirmed_at`. **Avatars** are additionally re-encoded via `sharp`
   into 256px and 64px webp variants stored under sibling R2 keys.

If the client crashes between steps 2 and 3, the `files` row is stuck
at `pending` and becomes an orphan — acceptable for now; GC is a future
cron. `file.delete` is best-effort (DB row first, R2 async).

### 6.3 Access control on download

`file.getDownloadUrl` gates signed GETs by the file's `purpose`:

- `avatar` — any authenticated user (avatars are public-ish inside the app).
- `transaction_receipt` — caller must be a member of the transaction's space.
- `event_attachment` — caller must be a member of the event's space.
- `exported_report` — file owner only.

GET TTL is 15 min; the web app re-requests on every mount
(`useSignedUrl` hook) rather than caching URLs.

### 6.4 Client hooks

- [`useFileUpload`](../apps/web/src/hooks/useFileUpload.ts) — the
  canonical way to upload. Orchestrates the three-step flow, surfaces
  progress + error, returns the confirmed `fileId`.
- [`useSignedUrl`](../apps/web/src/hooks/useSignedUrl.ts) — given a
  `fileId` + optional variant (`sm`), returns a signed URL. Used by
  `UserAvatar` and transaction receipt thumbnails.

---

## 7. Email

`services/mail/mailer.mts` uses **nodemailer** against `SMTP_*`.
Templates are **React 19 JSX** under `services/mail/templates/`,
rendered to HTML via `ReactDOMServer.renderToStaticMarkup`. Because
those templates are `.tsx` **compiled** by `tsc`, the server
`package.json` is marked `"type": "module"` and ships with `react` +
`react-dom` deps — that's deliberate, not bloat.

In dev, **MailDev** catches everything at `localhost:1080`; in prod,
SMTP credentials are real.

---

## 8. Dev environment (docker-compose)

`docker-compose.yml` brings up:

| Service | Port | Purpose |
|---|---|---|
| `orbit` | — | Node container running `pnpm dev` (turbo → server + web) |
| `postgres` | 5432 | DB with `uuidv7()` available |
| `maildev` | 1025 (SMTP) / 1080 (UI) | Catches outbound mail |
| `metabase` | 3001 | Optional analytics on the app DB |

First-time bringup: `docker-compose up --build`, then in a second
shell `docker-compose exec orbit pnpm --filter backend migrate`.

Host-side, the web dev server is on `:5173`, the API on `:3000`, and
the tRPC Playground (dev-only) at `/trpc-playground`.

---

## 9. CI / CD

Two GitHub Actions workflows in `.github/workflows/`:

### 9.1 `deploy-server.yml`

- Triggers on `push` to `main` that touches `apps/server/**`,
  workspace metadata, or itself.
- Uses `pnpm@9.7.0` + Node 22.
- Runs `vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod`
  with secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

### 9.2 `deploy-web.yml`

- Triggers on `push` to `main` that touches `apps/web/**`, workspace
  metadata, or itself.
- `pnpm install --frozen-lockfile` → `pnpm --filter web build` with
  `VITE_BACKEND_URL` injected from secrets.
- Deploys `apps/web/dist` to Cloudflare Pages via `wrangler pages deploy`
  under the `CLOUDFLARE_PAGES_PROJECT` name on branch `main`.

### 9.3 Migrations are out-of-band

Neither workflow runs DB migrations. They're manual:

```bash
pnpm --filter backend migrate           # against DATABASE_URL
```

This is intentional — migrations that touch production data should be
reviewed, not fire on every merge.

---

## 10. Logging & observability

Structured logs via a thin `logger` wrapper under
[`apps/server/src/utils/logger.mts`](../apps/server/src/utils/logger.mts).
`mutationLoggerMiddleware` wraps every `authorizedProcedure` mutation
for after-the-fact auditability (creator id, path, duration).

**No external APM / error tracker wired in yet.** Vercel's request logs
are the current debugging surface. Metabase on `:3001` (dev) and a
managed instance in prod provide ad-hoc SQL over the production DB for
product analytics.

---

## 11. Testing

**No automated test suite yet.** The highest-value integration target
is the account-balance trigger (018); the on-read balance helpers
(`resolveEnvelopePeriodBalance`, `resolveSpaceUnallocated`) are the
next tier. Manual smoke-test checklist in the product spec §16 is the
current stopgap.

The **type-check gate** is enforced manually:

```bash
pnpm check-types                         # both apps, turbo
# or
(cd apps/server && npx tsc --noEmit)
(cd apps/web    && npx tsc --noEmit)
```

Both must pass clean. No `any` on new code without a comment explaining
why (usually the Kysely enum workaround — §4.3).

---

## 12. Environment variables

Source of truth is
[`apps/server/src/env.mts`](../apps/server/src/env.mts), parsed via
`@withtahmid/safenv`. Summary:

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP listen (ignored on Vercel) |
| `DATABASE_URL` | docker-compose default | Postgres DSN |
| `NODE_ENV` | — | `development` enables tRPC Playground |
| `JWT_SECRET` | dev-only fallback | **Must be set in prod** |
| `APP_TIMEZONE` | `Asia/Dhaka` | App-wide IANA zone; session `SET TIME ZONE` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | MailDev | Transactional email |
| `R2_ACCOUNT_ID` | `""` | Cloudflare R2 account id |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | `""` | R2 IAM creds |
| `R2_BUCKET` | `""` | R2 bucket name |
| `R2_PUBLIC_URL_BASE` | optional | Public CDN base — if unset, signed URLs are used for GET |

Web build picks up `VITE_BACKEND_URL` at `pnpm --filter web build` time
(injected as a GitHub Actions secret).

---

## 13. Operational runbook (common tasks)

### 13.1 Ship a schema change

1. Add migration file `apps/server/src/db/kysely/migrations/NNN_name.mts`
   with `up` + `down`. Use `migration-template.mts` as a starting point.
2. Locally: `pnpm --filter backend migrate` then
   `pnpm --filter backend generate-types`.
3. Commit migration + regenerated `types.mts` together.
4. After merging to `main`, **manually** run the migrate command
   against the production `DATABASE_URL` before traffic hits the new
   server build.

### 13.2 Add a tRPC procedure

1. New file under `apps/server/src/procedures/<resource>/<action>.mts`.
2. Re-export from `apps/server/src/routers/<resource>.mts`.
3. No further registration — the router tree is composed in
   `routers/index.mts`.
4. Server rebuild on save; the web app picks up the new types on next
   `tsc` pass.

### 13.3 Add a file-backed feature

1. Pick a `purpose` that already exists in the enum, or extend the enum
   via a new migration + update
   [`PURPOSE_LIMITS`](../apps/server/src/procedures/file/shared.mts)
   and `uploadablePurposeSchema`.
2. On the server, use the existing three-step API. Junction table if
   the file belongs to an entity (see `transaction_attachments`).
3. On the web, use `useFileUpload` + `useSignedUrl`. Don't invent a
   new upload path.

### 13.4 Rotate secrets

- `JWT_SECRET` rotation invalidates every session. Acceptable for small
  user base; schedule during a low-traffic window.
- `R2_*` rotation requires both API and (if `R2_PUBLIC_URL_BASE` is
  used) web CDN cache purge; existing signed URLs continue to work
  until their 15-min TTL elapses.
- `SMTP_*` rotation is live — next email just uses the new creds.

### 13.5 Onboard a new engineer

1. Clone → `pnpm install` → `cp .env.local.example .env.local`.
2. `docker-compose up --build` → `pnpm --filter backend migrate`.
3. Read, in order: [`README.md`](../README.md),
   [`project-specification.md`](./project-specification.md),
   this file. Then pick a procedure and trace one end-to-end.

---

## 14. Open engineering work

- **Zero automated tests.** Highest-priority: trigger correctness
  (018), balance resolvers, `allocation.transfer` atomicity.
- **No error tracker.** Sentry or similar on both API and web would pay
  back quickly.
- **Cold-start cost on Vercel** is fine today but grows with the pg
  pool; consider a managed pooler (PgBouncer / Neon) if latency p99
  creeps up.
- **Orphan `pending` files** — no GC yet; pick them off with a nightly
  task that deletes files stuck in pending > 24h.
- **Per-space timezone** — schema would need a `spaces.tz` column and
  the SQL helpers would need to take `tz` as an arg instead of relying
  on the session setting.
- **Kysely enum codegen** — swap the generator or post-process
  `types.mts` to drop the ~40 `as unknown as T["col"]` casts.
- **Migrations in CI** — gated, opt-in, with a dry-run step. Currently
  manual (§9.3).

---

*End of engineering spec. Pair this with the product spec to make
non-trivial changes; read one or the other alone and you'll be missing
half the picture.*
