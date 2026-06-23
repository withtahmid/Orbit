---
name: alloc-upsert-race
description: Allocation deallocate/transfer guards do read-modify-write with no row lock — lost-update race drives rows negative
metadata:
  type: project
---

`createEnvelopAllocation` (procedures/envelop/createAllocation.mts) and `transferAllocation` (procedures/allocation/transfer.mts) both guard a negative/source-debit by READING `resolveEnvelopePeriodBalance` then APPLYING an accumulating UPSERT (`amount = amount + excluded.amount`). The read and the upsert are in the same trx but there is NO `SELECT ... FOR UPDATE` / advisory lock on the allocation row.

**Why:** Under READ COMMITTED (PG default), two concurrent deallocations both read remaining=100, both pass the guard for −100, both apply −100 → row ends at −100. The `ON CONFLICT` upsert only serializes the writes; the guards already passed against the stale pre-write read. Classic lost update.

**How to apply:** Any future change to allocation guards should lock the envelope/allocation row (e.g. `SELECT ... FOR UPDATE` on the envelope row, or read the allocation row FOR UPDATE) inside the same transaction before the guard. The model since migration 048 is one-row-per-(envelope, period); the row to lock is `(envelop_id, period_start)`.

**FIXED (round-2 of simplify-budgeting):** createAllocation now does `.forUpdate()` on the initial envelope select; transfer does `SELECT id FROM envelops WHERE id IN (from,to) ORDER BY id FOR UPDATE` up front. Both correct: locking the parent envelope row serializes all allocate/deallocate/transfer ops on that envelope (the guard reads the allocation child row but the envelope row is the serialization point, and every op locks it). Transfer's `ORDER BY id` makes the two-row lock deadlock-safe between A→B / B→A pairs. Locks are taken INSIDE the idempotency `fn`, AFTER the idempotency claim INSERT — so a completed-key replay never runs `fn` and takes no lock. No replay interaction. NOTE: the lock is on the envelope row, not the allocation row; that is sufficient because there is exactly one writer path per envelope and all of them lock the envelope first.
