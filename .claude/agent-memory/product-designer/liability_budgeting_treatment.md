---
name: liability-budgeting-treatment
description: Design call (2026-05-14) on credit cards / liabilities — split "Available to budget" (assets only) from "Net worth" (assets − liabilities); defer YNAB-style credit-card-payment envelopes to a Phase 2 with an explicit open question.
metadata:
  type: project
---

Decision direction for how Orbit should treat liability accounts in budgeting vs net-worth views:

**Current state (the bug to fix):** `resolveSpaceUnallocated`'s `spendable` does `SUM(asset balances) − SUM(liability balances)` (excludes locked). This double-counts credit-card spending: a card swipe already consumed the spending envelope, but the formula then *also* subtracts the card balance from cash, making "Available to budget" read lower than the actual cash in hand. User flagged this as the "wrong signal about cash in hand."

**Phase 1 (ship with the rename + merge):**
- Change `resolveSpaceUnallocated`'s `spendable` to `SUM(asset balances)` only. Liability accounts no longer reduce the budgeting surface.
- Add a new `resolveSpaceNetWorth` (or extend `analytics.spaceSummary`) returning `assets − liabilities` for an Overview "Net worth" tile, distinct from the "Cash available" / "Available to budget" tile.
- This is a small server change; resolves the cash-in-hand misread immediately.

**Phase 2 (deferred — needs an explicit user decision first):**
- Adopt YNAB's credit-card-payment envelope model: a card swipe auto-mirrors the spending category's consumption into a hidden "Pay {card name}" envelope, so cash stays earmarked but visible.
- Requires: new envelope subtype, ledger hooks in transaction create paths (`expense.mts`/`transfer.mts`), UI for card-payment envelopes on Budgets page, Reckoning extension.
- **Open question to resolve before starting Phase 2:** "Should a credit-card purchase consume the spending envelope at swipe time (YNAB-style, immediate) or at payment time (Monarch / Lunch Money, deferred)?" These two answers produce different schemas. Recommended answer if forced to pick: YNAB-style immediate — only model where "Available to budget" stays honest day-to-day.
- Also worth asking the user: is there a real credit-card user in production today, or aspirational? If aspirational, ship Phase 1 only and revisit.

**Why:** The user's reconciliation invariant requires "Available to budget" to be a property of cash, not net worth. Liabilities belong in a separate net-worth view. Without segregating them, every page that consumes `resolveSpaceUnallocated` will mislead users who carry any credit balance.

**How to apply:** Whenever a UI surface displays a "free to allocate" or "cash" number, source it from the asset-only spendable. Net worth is a sibling number, never a substitute. Any future analytics procedure needs to declare which of the two it's reporting.

See also [[plan-rename-to-goal]] and [[budgets-page-merge-goals-envelopes]].
