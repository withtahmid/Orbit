---
name: withIdempotency wrapper pattern
description: How the project's idempotency cache works. Storage shape, lock semantics, retry behavior.
type: project
---

`apps/server/src/utils/withIdempotency.mts` is the canonical wrapper for mutation idempotency.

**Mechanism:**
- INSERT INTO idempotency_keys ... ON CONFLICT (key) DO NOTHING. Avoids `25P02 in_failed_sql_transaction` (which catching `23505` would cause inside a trx).
- Storage shape is `{ v: result }` JSON sentinel — distinguishes "stored a null" from "claimed but not done".
- `response IS NULL` mid-flight = either trx still running or rolled-back (so the row was rolled back too — never observed in NULL state across trxs). Wrapper throws CONFLICT in that case.
- TTL: 7 days (column default).

**Cleanup:** `services/idempotencyCleanup.mts` periodically deletes expired rows. Currently kicked off as a side-effect of `trpc/context.mts` import — minor concern for tests but works in prod.

**Client-side (`apps/web/src/hooks/useIdempotencyKey.ts`):**
- One key per mounted form instance.
- `rotate()` called in `onSuccess` only — NOT on error. After error the trx rolled back, so a fresh claim with the same key works.
- Form uses `mutate.isPending` guard to prevent racing the same key across submits.

**Procedures wired with idempotency (idempotancy branch):** transaction.{expense,income,transfer,adjust}, envelop.{create,createAllocation,borrowFromNextMonth,undoBorrow}, plan.{create,createAllocation}, allocation.transfer, expenseCategory.create, reckoning.acknowledge.

**NOT wired (intentionally? or oversight?):** transaction.update.

**Known limitation:** wrapper doesn't validate input shape against cached response. If two distinct mutations share the same UUID (cosmically unlikely), the second sees the first's payload. A hash-of-input field would close this gap.
