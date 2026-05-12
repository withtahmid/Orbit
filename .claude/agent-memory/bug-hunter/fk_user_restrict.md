---
name: fk_user_restrict
description: Hard FK constraints prevent deletion of any user who has ever created/updated a space or recorded a transaction — owner checks alone never suffice.
metadata:
  type: project
---

`users.id` is targeted by FKs that resolve as `RESTRICT` (Postgres default for FKs without `ON DELETE`) from:
- `spaces.created_by` (RESTRICT, explicit since migration 027)
- `spaces.updated_by` (RESTRICT, explicit since migration 027)
- `transactions.created_by` (RESTRICT, explicit since migration 027)
- `envelop_allocations.created_by` (RESTRICT, migration 014)
- `plan_allocations.created_by` (RESTRICT, migration 017)

`onDelete: cascade` only covers: `space_members`, `user_accounts`, `email_verification_codes`, `idempotency_keys`, `reckoning_acknowledgments`, `transaction_attachments.uploaded_by`, `space_invites.invited_by`.

`files.uploaded_by` is `SET NULL`.

**Why:** Spec §15.13 invariant — created_by acts as a historical audit pointer; deleting the user would orphan financial records.

**How to apply:** Any procedure that calls `deleteFrom("users")` (e.g. [[user_delete_account]]) must, before attempting the delete, either (a) re-point every RESTRICTed column to a tombstone user, (b) soft-delete via a status column, or (c) refuse the delete when the user has any such row. A sole-owner check is necessary but nowhere near sufficient — the user almost certainly has transactions / allocations / spaces.created_by rows of their own.
