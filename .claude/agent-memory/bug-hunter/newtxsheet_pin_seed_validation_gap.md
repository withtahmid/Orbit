---
name: newtxsheet-pin-seed-validation-gap
description: NewTransactionSheet seeds account/envelope/event fields from pin cache in useState initializers; only account has a stale-validation effect — envelope and deleted-event pins are unvalidated.
metadata:
  type: project
---

In `apps/web/src/features/transactions/NewTransactionSheet.tsx`, the sub-forms
(IncomeForm/ExpenseForm/TransferForm/AdjustmentForm) seed `accountId`/`envelopeId`/`eventId`
synchronously from `pinState.pins` inside `useState(() => ...)` initializers (expense-form-bug-fix branch).

**Why:** fixes pinned defaults failing to auto-hydrate on the 2nd/3rd "Save & add another"
cycle — a controlled Radix Select whose value changed post-mount fired a spurious
`onValueChange("")` that wiped the field.

**How to apply / gap to watch:**
- Only the ACCOUNT field has a stale-validation effect (`if (!accountItems.some(...)) setSource("")`).
  It uses the *filtered* `accountItems`/`sourceItems` (excludes `locked` + non-`ownedByMe`), so a
  pinned account that is locked or shared-not-owned IS correctly cleared. Good.
- ENVELOPE has NO analogous validation effect. A pin pointing at an archived envelope is seeded and
  never cleared. Worse: `envelopePinnedAndActive` (`pins.envelop.id === envelopeId`) makes the
  category-default effect skip overwriting it, so the stale archived id survives to submit and gets
  rejected server-side. The archived envelope is also absent from `envelopeItems`, so the OrbitSelect
  chip renders `selectedEnvelope?.name ?? "—"`.
- EVENT: closed/inactive event pins are handled gracefully by EventSelect's stale-row branch
  (`isStaleValue`). But a DELETED event id (`valueEvent === null`) is not caught — value persists,
  no stale row, submits a dangling id.
