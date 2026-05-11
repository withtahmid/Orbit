# Module reference index

Quick-load references for future sessions. Each file is grounded in current code (file:line citations), not the older `contexts/{engineering,project}-specification.md` docs — those are flagged as outdated and should not be trusted without verification.

Use this index to jump straight to the module you need. Pair the server doc with the corresponding web doc when working on a feature end-to-end.

---

## Server modules (`server/`)

One file per procedure namespace under `apps/server/src/procedures/<name>/`, mirrored in `apps/server/src/routers/<name>.mts`.

| Module | Purpose |
|---|---|
| [auth](server/auth.md) | Signup (multi-step request → verify), login, password reset; issues real JWTs and short-lived `tmp` JWTs with purpose stamps. |
| [user](server/user.md) | Profile surface. **Currently only exposes `updateAvatar`** — no password change, email change, name edit, or account delete procedures exist. |
| [space](server/space.md) | Spaces + members CRUD, role machinery via `resolveSpaceMembership`. Last-owner protection lives in `removeMember` and `changeMemberRole` only. |
| [file](server/file.md) | Three-step R2 upload (createUploadUrl → client PUT → confirm). Avatar confirm re-encodes to webp. The `__placeholder__` r2_key trick threads the row id into the key. |
| [account](server/account.md) | Accounts (`accounts` table), space-sharing via `space_accounts`, ownership via `user_accounts`. `user_accounts.role` is `owner|viewer` only — distinct from `space_members.role`. |
| [envelop](server/envelop.md) | Envelope buckets per space, cadence (`none`/`monthly`), archived flag, carry policy. `envelop_balances` table **retired in migration 026** — period balance now computed on-read via `resolveEnvelopePeriodBalance`. |
| [plan](server/plan.md) | Long-term savings goals. `plan_balances` table also **retired in 026** — totals computed on-read. |
| [expenseCategory](server/expenseCategory.md) | Hierarchical categories pinned to envelopes. `priority` enum (essential/important/discretionary/luxury) inherited from ancestors via parent-walk CTE. |
| [allocation](server/allocation.md) | Intentionally narrow — only `transfer`. Per-bucket CRUD lives under `envelop.*` and `plan.*`. |
| [transaction](server/transaction.md) | Four creation paths (income/expense/transfer/adjust), each gated by per-type CHECK constraints. Transfer fees (`fee_amount` + `fee_expense_category_id`) hit the source account. `account_balances` is the only trigger-maintained table. |
| [event](server/event.md) | Recently extended (migration 038) with `status` (active/closed), `estimated_amount`, `closed_at`. `transactions.event_id` is `ON DELETE SET NULL`. New procedures: `getById`, `setStatus`. |
| [analytics](server/analytics.md) | ~35 procedures grouped by surface (summary / cash-flow / categories / envelopes / plans / events / accounts / heatmaps / recurring / trends / anomalies). Transfer fees folded into expense sums via `UNION ALL` pattern. |
| [personal](server/personal.md) | Virtual `/s/me` twin of analytics. Scoped by `resolveOwnedAccountIds` + `resolveMemberSpaceIds`. Owned→owned transfers excluded as "internal." |
| [reckoning](server/reckoning.md) | YNAB-style overspend reconciliation. Two procedures (`listPending`, `acknowledge`). The strict-gate that enforces `spaces.budget_mode='strict'` lives in `space/utils/resolveStrictGate.mts` (not in reckoning). |

---

## Web modules (`web/`)

One file per page module under `apps/web/src/pages/space/<name>/`.

| Module | Purpose |
|---|---|
| [overview](web/overview.md) | `OverviewPage.tsx` — space dashboard with today summary, cash flow, top categories, upcoming, recent transactions. Personal-twin aware. |
| [accounts](web/accounts.md) | `AccountsPage` (orbit-design CSS) + `AccountDetailPage` (still uses shadcn `Card`/`Tabs`). **Detail page is not personal-aware** — `/s/me/accounts/:id` would break. |
| [transactions](web/transactions.md) | `TransactionsPage.tsx` (~1900 lines) — filter bar + list + detail sheet + totals card, with personal-twin dispatch. New/Edit sheets live under `features/transactions/`. |
| [envelopes](web/envelopes.md) | `EnvelopesPage` + `EnvelopeDetailPage` — period state, overspend, allocations, borrow/carry. |
| [plans](web/plans.md) | `PlansPage` + `PlanDetailPage` — long-term savings goals. |
| [categories](web/categories.md) | `CategoriesPage` — category tree pinned to envelopes, tree CRUD. |
| [events](web/events.md) | `EventsPage` + `EventDetailPage` + supporting (`CreateOrEditEventDialog`, `DeleteEventDialog`, `EventStatusButton`, `eventUI.tsx`). Recently rewritten — segmented Active/Closed/All filter, estimate progress bar, detail page. |
| [analytics](web/analytics.md) | `AnalyticsPage` + eleven explicit child view routes. **Three views lack personal twins** (`AllocationsView`, `MatrixView`, `PriorityView`) — they break on `/s/me`. Adding a view requires both an `ENTRIES` tile and a route entry. |
| [reckoning](web/reckoning.md) | `ReckoningPage` — overspend reconciliation flow with a state machine. |
| [year-report](web/year-report.md) | `YearReportPage` — annual summary. |
| [settings](web/settings.md) | `SpaceSettingsPage` — space-level config (members, danger zone, budget mode). Still uses shadcn `Card`/`Tabs`. |

---

## Shared / cross-cutting (`shared/`)

Topics that span server + web or live in shared infrastructure.

| Doc | Purpose |
|---|---|
| [auth-flow](shared/auth-flow.md) | End-to-end signup/login/reset across server procedures, MobX stores, and token storage. `fetchUserFromJWT` does **not** hit the DB — JWT payload is trusted as-is (commented out in `trpc/auth.mts:41-53`). |
| [file-upload](shared/file-upload.md) | R2 three-step upload + signed downloads + `transaction_attachments`/`event_attachments`. R2 SDK quirk `requestChecksumCalculation: "WHEN_REQUIRED"` is load-bearing. |
| [routing](shared/routing.md) | Router tree, route constants, guards. **No `PublicRoute` exists** — only `GuestOnlyRoute` and `ProtectedRoute`; public routes are unwrapped. Personal-space sentinel `"me"` short-circuits `CurrentSpaceProvider`. |
| [stores](shared/stores.md) | MobX stores (Auth/Signup/ForgotPassword + Root). No separate `providers/StoreProvider.tsx` — exported from `stores/useStore.ts`. |
| [trpc-setup](shared/trpc-setup.md) | Server context/middlewares (`public`, `authorized`, `mutationLogger`) + web `httpBatchLink` with token rotation. `mutationLoggerMiddleware` insert is **commented out** — only timing happens. |
| [db-layer](shared/db-layer.md) | Kysely + migrations + `pnpm generate-types` + the `safeAwait` + transaction pattern. Migration filenames mix 4-digit (0001–0017) and 3-digit (018+) — lexicographic sort still works. `bootstrap.mts` does **not** auto-run migrations. |

---

## Drift watch — code vs. the older specs

Findings from the agents that documented current code; the older `engineering-specification.md` and `project-specification.md` may still claim otherwise.

### Retired or never-implemented
- `envelop_balances` and `plan_balances` tables (and their triggers) **retired in migration 026** — only `account_balances` is still trigger-maintained.
- `user` router exposes **only `updateAvatar`** — no password change, email change, name edit, or account delete procedures.
- **No `PublicRoute` guard** — the file doesn't exist.
- `mutationLoggerMiddleware` is **effectively a no-op** — insert into `mutation_logs` commented out.
- `fetchUserFromJWT` **does not re-fetch the user row** — JWT payload trusted as-is.
- `bootstrap.mts` does **not** auto-run migrations or seed — both calls commented out.
- `exported_report` file purpose exists in the enum and `getDownloadUrl` authz, but **no client-driven upload path** (`uploadablePurposeSchema` excludes it).

### Personal-space gaps
- Analytics views `AllocationsView`, `MatrixView`, `PriorityView` **lack personal twins** — break on `/s/me`.
- `AccountDetailPage` is **not personal-aware** — uses `account.listBySpace` with `space.id`, fails for `/s/me/accounts/:id`.

### Subtle invariants worth knowing
- Two role enums: `user_accounts.role = owner|viewer`, `space_members.role = owner|editor|viewer`. Edit on a space ≠ edit on its accounts.
- `envelops.carry_over` and `envelops.carry_policy` **coexist** — `carry_policy` is canonical (migration 035), but writers keep `carry_over` in sync as back-compat.
- `changeExpenseCategoryParent` **does not enforce envelope sharing** — only `create` does. Cross-envelope reparenting is silently callable.
- Envelope archive is **asymmetric**: allocate-in blocked, transfer-out/deallocate allowed → trapped cash can always be freed.
- Strict-gate (`spaces.budget_mode='strict'`) is called on expense/transfer/adjust but **not** income.
- Migration 038 added event `status`/`estimated_amount`/`closed_at`. `transactions.event_id` FK is `ON DELETE SET NULL`.

### Stale comments still in code
- `procedures/expenseCategory/changeEnvelop.mts:16-19` references `envelop_balances.consumed` — that table no longer exists.

---

## How to keep this index fresh

When a module changes substantially:
1. Update the relevant module file directly.
2. Add a one-line note to the "Drift watch" section above if it overturns a claim in the older specs.
3. Don't try to keep the older `engineering-specification.md` / `project-specification.md` in sync — treat them as historical context until they're explicitly rewritten.
