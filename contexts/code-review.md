# Orbit — Comprehensive Code Review

> Review date: 2026-04-18. Cross-verified against
> [project-specification.md](./project-specification.md). Findings are grouped
> by severity. Each item has a `path:line` anchor, the actual bug/mismatch,
> and a concrete fix direction so a later Claude session can act on it
> without re-investigating.

Legend:

- **CRITICAL** — produces wrong numbers visible to the user, or violates a
  documented invariant.
- **HIGH** — silent inconsistency between views or real precision/typing bug
  that will bite under realistic inputs.
- **MEDIUM** — brittle code, inconsistent pattern, minor correctness risk.
- **LOW** — style, duplication, cosmetic.

---

## CRITICAL

### C1. `carriedIn` is missing from space-level and cross-view aggregates

The project spec §5.1 + §9.3 explicitly models `carriedIn` as part of a
carry-over envelope's current-period **remaining**, and
[`resolveEnvelopePeriodBalance`](../apps/server/src/procedures/envelop/utils/resolveEnvelopePeriodBalance.mts#L109)
computes `remaining = carriedIn + allocated − consumed`. However, three
other readers of the same data compute `remaining = allocated − consumed`
(no carryIn), creating visible divergence between screens for any envelope
with `carry_over = true`.

Affected:

- [`resolveSpaceUnallocated.mts:87`](../apps/server/src/procedures/allocation/utils/resolveSpaceUnallocated.mts#L87)
  — `envelope_held = SUM(GREATEST(0, allocated − consumed))`. No carry-in.
  **Impact:** space-level unallocated/free-cash is **overstated** by the
  sum of carried-in amounts; the "Over-allocated" banner on Overview can
  stay silent when it should fire (and vice versa).
- [`envelopeUtilization.mts:174`](../apps/server/src/procedures/analytics/envelopeUtilization.mts#L174)
  — per-envelope `remaining = allocated − consumed`. No carry-in. Overview
  donut (Allocation map) and drift alerts read this. EnvelopeDetailPage
  reads `resolveEnvelopePeriodBalance` directly → numbers differ between
  the two screens for carry-over envelopes.
- [`accountAllocation.mts:122-123`](../apps/server/src/procedures/analytics/accountAllocation.mts#L122)
  — Account-detail Allocations tab shows `remaining = allocated − consumed`
  and `isDrift = remaining < 0`. An envelope healthy in its detail view
  (carried-in covers overspend) can show as drift on Account detail.

**Fix:** either (a) extend `resolveEnvelopePeriodBalance` into a SQL helper
used by all three call sites, or (b) widen each CTE to join the previous
period's allocation/consumption CTE and add `GREATEST(0, prevAlloc − prevCons)`
when `e.carry_over = true AND e.cadence <> 'none'`. Whichever approach, the
four call sites must stay in sync — pick one as canonical and document it
as the only place period math is computed.

---

### C2. `account.listBySpace` silently hides accounts from space members

[`listBySpace.mts:26-29`](../apps/server/src/procedures/account/listBySpace.mts#L26)
does an `INNER JOIN user_accounts` on the caller. The result: a space
member who is **not** in `user_accounts` for an account that's shared into
their space will not see that account on the space Accounts page, even
though transactions in that space reference it.

The spec §6.1 is ambiguous here (roles govern space data; account
permissions are independent), but §6.3 lists
`account.listByUser` as "every account the caller can access, across every
space, **with spaces list**" — implying the space-page list should be the
view from the space's perspective, not from user_accounts. The UI currently
renders the space Accounts page as if these accounts don't exist, but
transactions/allocations reference them, breaking mental continuity.

**Fix (choose one):**

1. If the intent is "only show accounts the caller has `user_accounts`
   permission on" — keep the join but add a visible placeholder row
   ("Shared account (no access)") when the space has an account the
   caller can't see, so they can at least identify it.
2. If the intent is "space members see all accounts in the space" —
   change the `INNER JOIN user_accounts` to a `LEFT JOIN`, drop the
   `my_role` requirement from the select (it'll be null), and gate
   mutate-capable UI off `user_accounts` role separately.

Either way, document the chosen model in the spec's §6.2.

---

### C3. Incorrect month-over-month delta sign for over-spending

[`OverviewPage.tsx:210-222`](../apps/web/src/pages/space/OverviewPage.tsx#L210)
computes `(cur − prev) / Math.abs(prev) * 100`. The StatCard then colors
the delta with `trendDirection: "lower-better"` for the expense card. The
math is correct for the income card (higher = better) but mis-handles one
edge for expenses:

- If last month was `$0` expense and this month is `$500`, `delta = null`
  (line 215 returns `null` when `p === 0 && c !== 0`). The card therefore
  shows no delta — but the user went from spending nothing to spending
  $500, which is the single most important signal. It should show "N/A —
  new spend" or "∞↑" rather than omit it.

**Fix:** in the null-prev branch, return a sentinel (e.g. `Infinity`) and
render a "New" pill in the StatCard instead of hiding the indicator.

Plus: when `p < 0` (which shouldn't happen for income/expense but does for
`periodNet`) `Math.abs(p)` produces a percentage with an arithmetically
correct sign but semantically inverted meaning — e.g. net improved from
`-$200` to `+$100`, delta = `(100 − (−200)) / 200 = 150%`, coloured
"higher-better" → ok for net. Just confirm `monthOverMonth` is only
applied to strictly non-negative values (currently income & expense).

---

## HIGH

### H1. `adjust.mts` uses `parseFloat` on a `numeric(20,2)` string

[`transaction/adjust.mts:37`](../apps/server/src/procedures/transaction/adjust.mts#L37)
does `input.newBalance − parseFloat(currentBalance.balance)`. JS number is
IEEE-754 double; `numeric(20,2)` can hold up to 18 digits before the
decimal. For balances above ~$2 × 10¹³ the subtraction silently loses
precision; even at $1M with cents, concatenated adjust calls can drift by
cents in edge cases.

**Fix:** use a decimal library (e.g. `decimal.js`) for the delta, or do
the subtraction in Postgres: `SELECT $1::numeric − balance FROM
account_balances WHERE account_id = $2`, then write the signed row.
Same pattern applies to any future arithmetic that mixes a DB string
amount with a JS number.

---

### H2. `accountAllocation.mts` duplicates period-window logic

[`accountAllocation.mts:65-79`](../apps/server/src/procedures/analytics/accountAllocation.mts#L65)
inlines the `CASE e.cadence WHEN 'none' … WHEN 'monthly' …` expression
that also exists in
[`resolveSpaceUnallocated.mts:38-45`](../apps/server/src/procedures/allocation/utils/resolveSpaceUnallocated.mts#L38).
When the spec's §9.1 "new cadences" line is acted on (adding `weekly` /
`yearly`), these inlined copies will go stale independently.

**Fix:** extract a SQL helper (e.g. an immutable function or a named CTE
factory in JS) that emits the `[p_start, p_end)` pair from a cadence
expression. Same helper should also be used when carryIn is added (C1).

---

### H3. `allocation/transfer.mts:80-81` uses `as any` on discriminated union

```ts
(input.from as any).accountId as string | null | undefined,
(input.to as any).accountId as string | null | undefined,
```

The `envelopTarget` and `planTarget` schemas both declare
`accountId: z.string().uuid().nullable().optional()`, so the access is
actually safe — **but** the cast to `any` defeats the whole point of the
discriminated union and invites future fields to disagree silently. If
someone adds a target kind without an `accountId`, this loop will silently
read `undefined` and skip the membership check.

**Fix:** replace with a typed helper:

```ts
function targetAccountId(t: Target): string | null | undefined {
    return t.accountId ?? null;
}
```

---

### H4. Currency rendered with `.toFixed(2)` (spec §15.15 violation)

`MoneyDisplay` is required for any user-facing currency value. Raw
`.toFixed(2)` appears in:

- [`EnvelopeDetailPage.tsx:549`](../apps/web/src/pages/space/envelopes/EnvelopeDetailPage.tsx#L549)
  — "available" label inside a Select option.
- [`EnvelopeDetailPage.tsx:624-625`](../apps/web/src/pages/space/envelopes/EnvelopeDetailPage.tsx#L624)
  — donut hint text: consumed / allocated.
- [`EnvelopeDetailPage.tsx:469`](../apps/web/src/pages/space/envelopes/EnvelopeDetailPage.tsx#L469)
  — form pre-fill of `neededAmount` (fine in an `<input>` value, but
  review for locale/negative handling).
- [`HeatmapView.tsx:106`](../apps/web/src/pages/space/analytics/views/HeatmapView.tsx#L106)
  — tooltip money.
- [`OverviewPage.tsx:979-983`](../apps/web/src/pages/space/OverviewPage.tsx#L979)
  — `formatShort` helper uses `toLocaleString`; acceptable only if
  confirmed to be non-currency (e.g. axis labels). Audit usages.
- [`allocation/transfer.mts:103`](../apps/server/src/procedures/allocation/transfer.mts#L103)
  — error message `"Source only has ${fromInfo.available.toFixed(2)} available."`.
  Server-side, so `MoneyDisplay` doesn't apply, but the web client should
  not have to re-parse this string to redisplay it. Return the number in
  `error.cause` or build the message on the client.

**Fix:** replace each with `<MoneyDisplay amount={…} />` (or a small
`formatMoney` helper for text contexts where JSX isn't possible).

---

### H5. Hardcoded `#64748b` "Unallocated" color in 5 locations

- [`OverviewPage.tsx:137`](../apps/web/src/pages/space/OverviewPage.tsx#L137)
- [`accounts/AccountDetailPage.tsx:422`](../apps/web/src/pages/space/accounts/AccountDetailPage.tsx#L422)
- [`envelopes/EnvelopeDetailPage.tsx:622`](../apps/web/src/pages/space/envelopes/EnvelopeDetailPage.tsx#L622)
- [`transactions/TransactionsPage.tsx:454`](../apps/web/src/pages/space/transactions/TransactionsPage.tsx#L454) and `:767`
- [`analytics/views/AllocationsView.tsx:85`](../apps/web/src/pages/space/analytics/views/AllocationsView.tsx#L85)

Spec §16.1 lists hardcoded colors as a review red flag.

**Fix:** add an exported constant in
[`lib/entityStyle.ts`](../apps/web/src/lib/entityStyle.ts) (e.g.
`UNALLOCATED_COLOR`) and import it at every site. Bonus: consider exposing
it as a CSS var `--unallocated` so charts and HTML agree.

---

### H6. Account permission check missing in `analytics.accountAllocation`

[`accountAllocation.mts:34-53`](../apps/server/src/procedures/analytics/accountAllocation.mts#L34)
validates space membership and confirms the account is in the space, but
does **not** call `resolveAccountPermission`. Per spec §6.2 + §15.11,
account view/edit is orthogonal to space membership — a user can be a
space editor yet not have `user_accounts` access to a specific account
(e.g. the owner did not grant them view).

Today this procedure is still reachable for a space member and leaks the
per-envelope/per-plan allocation breakdown for an account they shouldn't
see. Compare with `listBySpace.mts` which *does* gate on `user_accounts`
(C2 above — the flip side of the same inconsistency).

**Fix:** add

```ts
await resolveAccountPermission({
    trx,
    accountId: input.accountId,
    userId: ctx.auth.user.id,
    roles: ["owner", "viewer"] as unknown as UserAccounts["role"][],
});
```

right after the space membership check. Decide once, at the spec level,
whether account data is space-gated or account-ACL-gated; both procedures
must then agree.

---

### H7. `listByUser` returns every space an account is in

[`listByUser.mts:37-47`](../apps/server/src/procedures/account/listByUser.mts#L37)
joins `space_accounts` + `spaces` for each account the caller is in
`user_accounts` for, with no filter for "spaces the caller is a member of."
Result: the caller's MyAccounts page can list e.g. "Shared with Alice's
Budget Space" even when the caller isn't in Alice's space — revealing the
existence and name of that space.

Depends on threat model, but the spec §15.10 (space isolation) reads as a
stronger invariant than what this procedure enforces.

**Fix:** add a `WHERE EXISTS (SELECT 1 FROM space_members sm WHERE
sm.space_id = space_accounts.space_id AND sm.user_id = $userId)`
subfilter, and display non-member-space counts as an anonymous chip
("+ 2 other spaces") if you want to keep the signal without leaking names.

---

### H8. Missing `onDelete` on user-referencing FKs

- [`0013_create_transactions_table.mts:13`](../apps/server/src/db/kysely/migrations/0013_create_transactions_table.mts#L13)
  — `created_by → users.id` with no `onDelete`. Postgres defaults to
  `NO ACTION`, which behaves like `RESTRICT` at commit time. Compare with
  the spec §15.13 which claims `envelop_allocations.created_by` is
  `RESTRICT`. Either declare `RESTRICT` explicitly here too, or adopt a
  soft-delete plan for users and switch to `ON DELETE SET NULL`.
- [`0004_create_spaces_table.mts:10-11`](../apps/server/src/db/kysely/migrations/0004_create_spaces_table.mts#L10)
  — `created_by` / `updated_by` same.

**Fix:** add `.onDelete("restrict")` (or "set null" and make the columns
nullable) to align with the spec. Add a migration; don't edit the old one.

---

## MEDIUM

### M1. SQL via string interpolation in the envelope period helper

[`resolveEnvelopePeriodBalance.mts:154-173`](../apps/server/src/procedures/envelop/utils/resolveEnvelopePeriodBalance.mts#L154)
constructs fragments like `${alias}.account_id = '${safe}'::uuid` that are
passed to `sql.raw`. The UUID is Zod-validated upstream, and the `.replace`
provides a second layer of defence, but the pattern is fragile: a future
caller that forgets the zod validator would introduce SQL injection.

**Fix:** Kysely's `sql` tag parameterises any expression; rewrite the
fragment as a `RawBuilder` that embeds `accountId` via `${accountId}`
rather than a string replacement. The alias can stay `sql.raw` since it's
a compile-time constant.

---

### M2. Envelope top-line `remaining` is not clamped before display

[`envelopeUtilization.mts:174`](../apps/server/src/procedures/analytics/envelopeUtilization.mts#L174)
returns the signed top-line `remaining` as-is. The Overview donut filters
with `e.remaining > 0` (correct), but the envelope card on EnvelopesPage
shows the raw value. For cadence='none' envelopes this is lifetime `alloc
− consumed`, which can be hugely negative and look like a crashed number.

**Fix:** add a UI-level clamp when rendering as a "remaining" badge, and
surface drift via an explicit `isDrift` flag (which you already have on
the breakdown rows but not at the top level).

---

### M3. `allocation.transfer` membership check uses source's space only

[`transfer.mts:71-76`](../apps/server/src/procedures/allocation/transfer.mts#L71)
validates space membership on `fromInfo.spaceId`, and rejects if the two
spaces differ a few lines earlier (line 57-62). Correct, but brittle:
if a future refactor relaxes the cross-space check, the membership gate
will silently only cover the source space. Add an explicit call for the
destination too (it's a no-op today but defence in depth).

---

### M4. `unshareFromSpace.mts:53-57` swallows any `resolveAccountPermission` error

```ts
await resolveAccountPermission({...}).catch(() => {});
```

Intent (per comment): the space-owner path may legitimately be missing
from `user_accounts`, so don't double-fail. Side-effect: a "not-found"
error for the account itself is also swallowed, and the procedure falls
through to the `space_accounts` existence check (which *does* 404
correctly, so the user-visible behaviour is ok). Still brittle:

**Fix:** change the catch to filter by error code:

```ts
.catch((e) => {
    if (e instanceof TRPCError && e.code === "FORBIDDEN") return;
    throw e;
});
```

---

### M5. Numeric column precision inconsistency

Allocations and transaction amounts are `numeric(12,2)` while
`account_balances.balance` is `numeric(20,2)`. Sums of many (12,2) rows
can accumulate into the (20,2) aggregate without overflow, but mixing the
two precisions is inconsistent and forces every JS `Number(…)` conversion
to reason about two different max-values.

**Fix (low priority):** standardise on `numeric(20,2)` in a future
migration, or document why the asymmetry exists (e.g. "single transaction
can't exceed $99,999,999,999.99").

---

### M6. Period bounds for cadence='none' use `DATE '9999-12-31'`

Appears in
[`resolveSpaceUnallocated.mts:43`](../apps/server/src/procedures/allocation/utils/resolveSpaceUnallocated.mts#L43)
and [`accountAllocation.mts:74`](../apps/server/src/procedures/analytics/accountAllocation.mts#L74)
and [`periodWindow.mts:24`](../apps/server/src/procedures/envelop/utils/periodWindow.mts#L24).
The JS helper uses `9999-12-31T00:00:00Z` as `end`, but `transaction_datetime
< end` is a strict comparison so a transaction at exactly that instant
would be excluded. Unlikely in practice but the spec's §5.1 window is
"[epoch, +∞)", which today is really "[epoch, 9999-12-31)".

**Fix:** use a date-less sentinel or accept the practical-infinity cap
and document it. Not urgent.

---

### M7. `monthProgress` memoization relies on implicit stability

[`OverviewPage.tsx:225-236`](../apps/web/src/pages/space/OverviewPage.tsx#L225)
uses `useMemo(() => …, [])` with an eslint-disable comment. The closure
captures the frozen `now` via the `useState` init; correct *today* but
silently incorrect if `now` is ever refactored into something dynamic.

**Fix:** add `[now, thisMonthStart]` to the deps array. `now` is frozen,
so the dep array will still be stable across renders; the eslint-disable
becomes unnecessary and the code self-documents.

---

### M8. Drift detection on carry-over envelopes is not aligned with §15.9

Per spec §15.9, "drift (allocated < consumed) is legal state." When a
carry-over envelope has `carriedIn > 0` covering current-period overspend
(e.g. allocated 0, consumed 50, carriedIn 100, remaining 50), every
current reader (envelopeUtilization, accountAllocation) marks it as drift.
The carry-in covers the overspend — this is exactly the scenario
carry-over was added to support.

**Fix:** redefine `isDrift` as `allocated + carriedIn < consumed` once
C1 is addressed. Until C1 ships, surface both values in the breakdown
so the UI can decide.

---

### M9. `driftAlerts` on OverviewPage reuses the same (envelope, account) row when unassigned

[`OverviewPage.tsx:188`](../apps/web/src/pages/space/OverviewPage.tsx#L188)
labels `b.accountId ? … : "Unassigned pool"` — but spec §15.8 states the
unassigned pool is not consumed by transactions. Drift on an unassigned
row therefore means "someone deallocated more than was there," which is
guarded by the allocation-create balance check. In practice the breakdown
FULL OUTER JOIN in `envelopeUtilization.mts:128-131` can still emit a
`account_id IS NULL` row when there's been spend-without-allocation on
the unassigned pool (which shouldn't happen). Confirm this row never
appears; if it does, the root issue is somewhere upstream.

**Fix:** add a filter `WHERE NOT (account_id IS NULL AND consumed > 0)`
to the breakdown query, or raise a server-side warning log when that
row exists.

---

## LOW

### L1. `transfer.mts` error messages expose raw floats

Line 103: `` `Source only has ${fromInfo.available.toFixed(2)} available.` ``
— backend string, user-visible via toast. Use a numeric field in
`TRPCError.cause` and let the client format.

### L2. Inconsistent input casing

[`expense.mts:20`](../apps/server/src/procedures/transaction/expense.mts#L20)
uses `expense_category_id` (snake_case) as an *input* field while the web
client uses `expenseCategoryId` elsewhere. Pick one (camelCase is the
spec's §14.1 convention) and stick with it across all procedures.

### L3. `/accounts` nav inconsistency

[`AppShellLayout.tsx`](../apps/web/src/layouts/AppShellLayout.tsx) and
[`SpaceLayout.tsx`](../apps/web/src/layouts/SpaceLayout.tsx) both carry a
"My accounts" entry. Verify they both `Link to={ROUTES.myAccounts}` (not
a hardcoded `/accounts`). Quick grep will confirm.

### L4. `listShareableForSpace` returns accounts the caller owns only

[`listShareableForSpace.mts:30-36`](../apps/server/src/procedures/account/listShareableForSpace.mts#L30)
filters to `user_accounts.role = 'owner'`. Per spec §6.3 this is correct
("accounts caller owns that aren't in this space"). Just note: a user who
can view but not own an account can't share it — confirm this matches
product intent before shipping to users.

### L5. `balance` is sometimes `Number(a.balance ?? 0)`, sometimes raw string

- [`listByUser.mts:68`](../apps/server/src/procedures/account/listByUser.mts#L68)
  returns `Number(a.balance ?? 0)`.
- [`listBySpace.mts:60`](../apps/server/src/procedures/account/listBySpace.mts#L60)
  returns `a.balance` as the raw string (type flows through as `numeric`
  which Kysely surfaces as `string`).

The web side has to handle both shapes (tRPC type will call one `number`
and the other `string`). Pick one and normalise.

### L6. `formatShort` in OverviewPage is a quiet MoneyDisplay bypass

[`OverviewPage.tsx:979`](../apps/web/src/pages/space/OverviewPage.tsx#L979)
— if it's used for axis ticks only (chart context), that's fine; if it
leaks into labels the user reads as money, replace.

### L7. `account.listByUser` has no pagination

All accounts are returned in one request. For users with tens of accounts
this is fine; document that it's a product constraint.

### L8. `envelopeUtilization.breakdown` FULL OUTER JOIN may produce duplicate NULL account rows

Depending on whether both alloc and spend exist, `NULL IS NOT DISTINCT
FROM NULL` is true, so it merges — but if there are rows in only one
side, the COALESCE emits one row per side. Benign but worth a unit test.

---

## Cross-cutting recommendations

1. **Consolidate period math**: one helper that, given a cadence + at,
   returns SQL fragments for `[start, end)`, `[prevStart, prevEnd)`, and
   the allocation-in-window filter. Used by every reader. C1 + H2 + M6
   all get easier.
2. **Single envelope-period-balance SQL CTE** used by every analytics
   procedure (`resolveSpaceUnallocated`, `envelopeUtilization`,
   `accountAllocation`). Eliminates drift between screens.
3. **Decimal arithmetic discipline**: document in spec §14.1 that all
   money arithmetic stays in Postgres, and JS only converts at the
   outermost projection. The `adjust` and `update` procedures are the
   current offenders.
4. **Settle the account-permissions-vs-space-membership matrix** in
   the spec: either accounts are space-gated once shared, or they
   remain independently ACL-gated. Today different procedures behave
   differently (C2, H6).
5. **Constants file for semantic UI colors** so hardcoded hex strings
   like `#64748b` live in one place (H5).

---

## Not-a-bug / already correct (noted to pre-empt phantom reports)

- `planProgress.mts:63` — `pa.account_id::text` with NULL correctly
  yields SQL `NULL`, not the literal string `"NULL"`. Downstream mapping
  treats NULL as the unassigned pool. Earlier draft of this review
  flagged it incorrectly.
- Trigger `__sync_account_balance_from_transactions` correctly handles
  UPDATE by reversing OLD then applying NEW; CHECK constraints on
  `transactions` prevent type changes that would orphan balances.
- `resolveEnvelopePeriodBalance`'s SQL interpolation of UUIDs is
  defence-in-depth on top of Zod validation — safe today, brittle
  pattern (M1).
- `OverviewPage` correctly freezes `now` via `useState(() => new Date())`
  per spec §13.6. The eslint-disable pattern is intentional (M7 is a
  polish note, not a bug).

---

*End of review. Priorities for the next Claude session:* **C1** (carryIn
divergence is the most likely source of actual user-visible wrong
numbers), **C2/H6** (settle account-vs-space permission model), **H1**
(decimal precision in adjust), then everything under HIGH, then MEDIUM.
