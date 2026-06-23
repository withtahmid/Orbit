---
name: allocation-ledger-direction-tension
description: 2026-06-23 — owner wants to COLLAPSE allocations to one row per (envelope, month) and drop the timestamped ledger; this directly contradicts the in-flight "typed ledger" refactor documented in analytics/CLAUDE.md (kind enum, migration 045). Strategic fork to resolve before building.
metadata:
  type: project
---

The owner (2026-06-23, `simplify-budgeting` branch) wants the envelope allocation model collapsed to ONE row per (envelope, month) with a DB unique constraint, dropping the timestamped allocate/de-allocate history, borrowing, and the reckoning nag.

**Why this is load-bearing:** The codebase is mid-refactor in the OPPOSITE direction. `apps/server/src/procedures/analytics/CLAUDE.md` declares `envelop_allocations` is "being promoted to a first-class typed ledger" — migration 045 added `kind` (allocate/borrow/cover/reckon/restructure) + `effective_at`, and the stated rule is "Derive from the ledger. Do not add new columns or side tables to express envelope state." There are `LEDGER-REPLACEABLE` markers planted across analytics + web to be retired as ledger writers land. The owner's "collapse to one number per month" proposal would abandon and reverse this refactor.

**How to apply:** Do NOT silently pick a side. Surface this as the #1 decision: the simplification is sound (the ledger has accreted complexity and has known anomalies — see [[carry_both_absorb_gap_anomaly]], [[budgeting_overengineering_audit]]) BUT it kills an explicitly-documented architectural direction and the `kind`-based analytics that borrow/reckon would have produced. The owner is the right person to kill it; just make sure he's killing it knowingly. Transfer-between-envelopes (which he keeps) is currently expressed as TWO ledger rows (debit+credit) in `allocation/transfer.mts` — under a unique (envelope,month) model it must become two row UPDATEs (upserts), and the source-has-enough guard must read the single-row balance.

**Key structural facts verified this session (state of branch as of 047):**
- `envelop_allocations` has NO month column. Period membership is derived: `COALESCE(period_start, date_trunc('month', created_at))`. `period_start` is nullable; monthly rows store it, rolling (`cadence='none'`) rows store NULL.
- Carry is derived ON READ, one period back, gated by `carry_policy` (reset/positive_only/both) in `resolveEnvelopePeriodBalance.mts`. There is NO stored carry/rollover row.
- Borrow = two linked rows (`+amt` this month, `−amt` next month) sharing `borrowed_link_id`, `kind='borrow'` (`borrowFromNextMonth.mts`). Removing borrow ≠ just deleting a button; the −next-month row is how "you can't forget you borrowed" is enforced.
- The nag has TWO layers: (1) soft banner via `reckoning.listPending` (skippable in flexible mode), and (2) a HARD `resolveStrictGate.mts` that throws PRECONDITION_FAILED and BLOCKS transaction.expense/transfer/adjust when `spaces.budget_mode='strict'` AND user has unacked past-month overspends. Removing the nag must decide the fate of strict mode + `budget_mode` column + `reckoning_acknowledgments` table. Web pre-flight-disables the Save button in strict mode (NewTransactionSheet).
- Rolling envelopes carry forward by NOT slicing by period at all (window = [epoch, ∞)); "carryover" for them is just lifetime SUM. So #1's unique (envelope,month) key only applies to monthly envelopes — rolling/goal envelopes have no month and must stay single-pool. This is the sharpest ambiguity in the owner's framing.
- Web UX ALREADY has a per-month model: `BudgetMonthPage` at `/s/:spaceId/budgets/month/:month` (YYYY-MM slug) with a month picker. So the "one number per envelope per month" mental model is already what the UI presents — the change is mostly storage + removing borrow/nag, not a new UX paradigm.
- `BudgetDetailPage` "Allocation history" table renders timestamped rows from `analytics.envelopeHistory` and offers per-row delete — this is the literal UI the owner calls "bullshit." It breaks/empties under the collapse.
