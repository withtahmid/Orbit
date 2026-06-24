---
name: Transfer fee storage
description: Post-mig-048, transfer fees are a SEPARATE type='expense' row (own envelop_id + source_account_id), not a fee column
type: project
---

Transfer fees are written as a **separate `transactions` row** with `type='expense'`, `amount = feeAmount`, `envelop_id = feeEnvelopId`, `expense_category_id = feeExpenseCategoryId`, `source_account_id` = the transfer's source, `destination_account_id = null`, and `parent_transfer_id` pointing at the transfer leg. See `transaction/transfer.mts` (~L115-134) and `transaction/update.mts` (~L250+). The `transactions` table has NO `fee_amount` / `fee_expense_category_id` columns — that was the pre-048 model and my earlier memory was wrong.

**Why:** The post-048 simplified model keeps everything as ordinary rows; the input still takes `feeAmount`/`feeExpenseCategoryId`/`feeEnvelopId` together (all-or-none, validated in `FEE_FIELDS`), but persistence is a plain second expense row.

**How to apply:**
- Any aggregation that does `WHERE type='expense' AND envelop_id = X` (e.g. `spaceSummary`, `personal/summary`, `envelopeUtilization` consumed) **already captures the fee** — no UNION needed. A fee correctly counts as consumption of its `feeEnvelopId` envelope.
- So when reviewers ask "did refactor X lose transfer fees by dropping a fee UNION?" — check the old code: if the old query also keyed on `type='expense' AND envelop_id`, the fee was already in; a UNION on a fee column would have been dead/double-counting against the current schema.
- A category-id-keyed filter (`expense_category_id = X`) still matches the fee row because the fee row carries `expense_category_id = feeExpenseCategoryId`.
