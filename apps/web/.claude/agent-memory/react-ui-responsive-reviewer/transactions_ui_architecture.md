---
name: transactions-ui-architecture
description: Transactions page owns selectedTx + editingTx sheet state; EditTransactionSheet is controlled, not self-triggered.
metadata:
  type: project
---

The transactions page (`apps/web/src/pages/space/transactions/TransactionsPage.tsx`) is the single owner of two right-side Radix sheets:

- `selectedTx` -> `TransactionDetailsSheet` (read-only details + attachments)
- `editingTx` -> `EditTransactionSheet` (controlled-open via `open` + `onClose` props)

**Why:** Previously each desktop row mounted its own `EditTransactionSheet` (with internal `SheetTrigger`). If the details sheet was open and the user clicked the row's pencil button, two right-side sheets would stack with the same width — visually broken. Mobile had no edit affordance at all because the pencil-cell wasn't rendered. Hoisting to the page fixes both.

**How to apply:** When adding any sheet/modal that overlaps with `TransactionDetailsSheet`, route through page-level state. The details sheet receives `onEdit` which is expected to (1) clear `selectedTx` so details closes first and (2) set the row in `editingTx` so the edit sheet opens after — never simultaneously. See [[orbit-form-primitives]] for the envelope-chip pattern that EditTransactionSheet now mirrors from NewTransactionSheet.

Fee-expense rows (`parent_transfer_id != null`) get a special `OrbitInfoPill` banner and a disabled source-account `OrbitSelect` in the edit form — the invariant is that fees come from the same source as their parent transfer, and editing them independently silently breaks that.
