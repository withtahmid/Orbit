---
name: Envelope-as-intent redesign
description: After the redesign, envelopes are space-wide planning units with allocations storing account_id=NULL.
type: project
---

The "envelope-as-cash-partition with per-account breakdown" model was retired. New model:
- Envelopes are space-wide planning units (intent).
- `envelop_allocations.account_id` is `NULL` for all new rows (createAllocation.mts and borrowFromNextMonth.mts hard-code `null`).
- Per-account allocation surfaces (RebalanceDialog, account-pinned breakdowns) removed from web.
- Legacy `account_id` non-null rows still exist in the DB for back-compat — queries should NOT filter them out, but should also not REQUIRE a non-null account_id.

**Why:** Old model created friction (users had to pick which account funded each envelope); the new model just plans across all spendable cash.

**How to apply:** When reviewing analytics SQL, check whether `account_id` filters on envelop_allocations make sense:
- `analytics/envelopeUtilization` — has `breakdown` array per account, but the top-line `allocated` does NOT filter by account. Correct.
- `analytics/accountAllocation` — pre-redesign, this was per-account. Now all envelope partitions read 0 since allocations have account_id=NULL. Possibly intentional (page hides envelopes with 0 activity), but worth questioning whenever the page is invoked.
