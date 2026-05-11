# Accounts (web)

> List of accounts in the space and a per-account detail view with balance history, transactions, sharing, members, and settings.

## Route(s)
- List: `ROUTES.spaceAccounts(id)` -> `/s/:spaceId/accounts` (`apps/web/src/router/routes.ts:13`).
- Detail: `ROUTES.spaceAccountDetail(id, accId)` -> `/s/:spaceId/accounts/:accountId` (`apps/web/src/router/routes.ts:14`).
- Lazy-imported in `apps/web/src/router/index.tsx:26-27`, mounted at `apps/web/src/router/index.tsx:152-158` under `SpaceLayout`.
- Guards: `ProtectedRoute` -> `CurrentSpaceProvider` -> `SpaceLayout`. List page is personal-aware (dispatches to `account.listByUser` when `space.isPersonal`); detail page is NOT personal-aware — it always calls `account.listBySpace` with `space.id` (`AccountDetailPage.tsx:86`), so visiting `/s/me/accounts/:id` would not resolve. Personal users reach detail via `/accounts` (the `MyAccountsPage` app-shell route, not this module).

## Files
- `apps/web/src/pages/space/accounts/AccountsPage.tsx` — list. Renders within an `.orbit-design ac-root` wrapper (`AccountsPage.tsx:136`) using inline `AC_STYLES` (custom orbit-design CSS).
- `apps/web/src/pages/space/accounts/AccountDetailPage.tsx` — detail. Uses shadcn-style `<Card>` / `<Tabs>` (`AccountDetailPage.tsx:38,42`) rather than orbit-design CSS — visually distinct from the list.
- Feature dialogs consumed: `apps/web/src/features/accounts/CreateAccountDialog.tsx`, `apps/web/src/features/accounts/AddExistingAccountDialog.tsx`.

## tRPC procedures consumed
List page (`AccountsPage.tsx`):
- `account.listBySpace` with `{ enabled: !isPersonal }` (`:40-43`).
- `account.listByUser` with `{ enabled: isPersonal }` (`:44-46`) — narrowed to owner accounts and decorated with the current user as the sole owner.
- `space.memberList` for the member-count tile (`:47-50`), real-space only.

Detail page (`AccountDetailPage.tsx`):
- `account.listBySpace` to find `accountId` in the result (`:86`).
- `transaction.listBySpace` with `accountId` filter, `limit: 50` (`:89-92`).
- `account.listUsers` for the Members tab (`:94-97`).
- `analytics.balanceHistory` inside a sub-component for the History tab (`:724`).
- `account.listSpaces` + `account.shareWithSpace` + `account.unshareFromSpace` for sharing (`:485,615,487`).
- `account.update`, `account.delete`, `account.addMember`, `account.removeMember` (`:99,338,421,392`).
- `auth.findUserByEmail` for the invite-by-email flow (`:417`).

Feature dialogs:
- `CreateAccountDialog`: `account.create` (`CreateAccountDialog.tsx:74`).
- `AddExistingAccountDialog`: `account.listShareableForSpace` + `account.shareWithSpace` (`AddExistingAccountDialog.tsx:32,37`).

## State & mutations
- List page: no mutations of its own — it composes `CreateAccountDialog` and `AddExistingAccountDialog` and shows balances with `totals` derived from the merged `accounts` array (assets/liabilities/locked).
- Detail page mutations and invalidations:
  - `account.delete` -> invalidates `account.listBySpace` then navigates back to the list (`AccountDetailPage.tsx:100-105`).
  - `account.update` -> invalidates both `account.listBySpace` and `account.listByUser` (`:341-342`).
  - `account.addMember` / `account.removeMember` -> invalidate `account.listUsers` (`:395,424`).
  - `account.shareWithSpace` / `account.unshareFromSpace` -> invalidate `account.listSpaces` + both account lists (`:491-493,619-621`).
- Permission gating:
  - List: `PermissionGate roles={["owner","editor"]}` around add CTAs; `PermissionGate roles={["owner"]}` around create (`AccountsPage.tsx:156,164`).
  - Detail: `PermissionGate roles={["owner"]}` around delete and other destructive actions (`AccountDetailPage.tsx:156,263,275`).

## Conventions & gotchas
- The list dispatches to `account.listByUser` in personal mode and rewrites each row so `owners` becomes `[me]`; cross-space metadata is preserved in `_spaces` / `_otherSpacesCount` (`AccountsPage.tsx:53-89`).
- The detail page uses shadcn `Card`/`Tabs` and is the only place under `pages/space/accounts/` that does — do not "harmonize" it without checking the design intent.
- Detail page tabs: `transactions`, `history`, `shared`, `members`, `settings` (owner-only) — see `AccountDetailPage.tsx:150-159`.
- "Members" on an account is separate from space members — accounts have their own owner set; `account.listUsers` returns that, while `space.memberList` is what the list-page tile counts.
- Detail page is not personal-aware. Navigating from `/s/me/accounts` (which doesn't link there anyway) would 404 the account lookup.

## Cross-references
- Server: `apps/server/src/procedures/account/*` (one-per-file convention).
- Web: shares the create-account dialog with the app-shell `MyAccountsPage`; transactions tab depends on `pages/space/transactions/TransactionsPage.tsx`; balance history reuses `analytics.balanceHistory` consumed in `analytics/views/BalanceHistoryView.tsx` and `OverviewPage.tsx`.
